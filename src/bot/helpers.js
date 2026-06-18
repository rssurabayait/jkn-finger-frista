//@ts-check
import { setTimeout as wait } from 'node:timers/promises';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import bot from 'node-autoit-koffi';
import { logger } from '../logger.js';

const exec = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const errorLogsDir = path.resolve(__dirname, '..', '..', 'logs', 'errors');

/** @param {number} ms */
export const delay = (ms) => wait(ms);

/**
 * Format unknown error jadi string pendek untuk log.
 * @param {unknown} e
 * @returns {string}
 */
export function formatError(e) {
	if (e instanceof Error) return e.message;
	if (typeof e === 'string') return e;
	try {
		return JSON.stringify(e);
	} catch {
		return String(e);
	}
}

/**
 * @param {string} winTitle
 * @returns {Promise<boolean>}
 */
async function isWindowOpen(winTitle) {
	return Boolean(await bot.winExists(winTitle));
}

/**
 * Pastikan window terbuka, sudah maximized, dan aktif.
 * Kalau belum ada, jalankan path installer dan tunggu sampai ready.
 *
 * @param {{ WIN_TITLE: string; INS_PATH: string }} cfg
 * @param {{ timeout?: number }} [opts]  timeout dalam detik (default 30)
 * @returns {Promise<boolean>} true kalau sudah terbuka sebelum call
 */
export async function ensureWindow(cfg, opts) {
	const timeout = opts?.timeout ?? 30;
	const already = await isWindowOpen(cfg.WIN_TITLE);
	if (!already) {
		logger.info(`[${cfg.WIN_TITLE}] window belum ada, membuka ${cfg.INS_PATH}`);
		await bot.run(cfg.INS_PATH);
		await bot.winWait(cfg.WIN_TITLE, '', timeout);
		await bot.winSetState(cfg.WIN_TITLE, '', 4);
	}
	await bot.winActivate(cfg.WIN_TITLE);
	try {
		await bot.winWaitActive(cfg.WIN_TITLE, '', timeout);
	} catch {
		logger.warn(`[${cfg.WIN_TITLE}] winWaitActive timeout — coba activate ulang`);
		await bot.winActivate(cfg.WIN_TITLE);
		await delay(500);
	}
	return already;
}

/**
 * Wrapper: jalankan fn, return early kalau instance.abort === true.
 * Berguna untuk loop klik yang bisa di-interrupt via action=close.
 *
 * @template T
 * @param {{ abort: boolean }} instance
 * @param {() => Promise<T>} fn
 * @returns {Promise<T | undefined>}
 */
export async function withAbort(instance, fn) {
	if (instance.abort) {
		logger.warn('Bot di-abort sebelum aksi dijalankan');
		return undefined;
	}
	const out = await fn();
	if (instance.abort) {
		logger.warn('Bot di-abort saat aksi berjalan');
		return undefined;
	}
	return out;
}

/**
 * Konversi string/number ke number dengan fallback.
 * @param {unknown} value
 * @param {number} fallback
 */
export function toInt(value, fallback) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Tutup aplikasi target secara paksa.
 * @param {{ WIN_TITLE: string; INS_PATH: string }} cfg
 */
export async function forceClose(cfg) {
	try {
		await bot.processClose(cfg.INS_PATH);
	} catch (/** @type {unknown} */ e) {
		logger.warn(`processClose gagal: ${formatError(e)}`);
	}
	try {
		await bot.winClose(cfg.WIN_TITLE);
	} catch (/** @type {unknown} */ e) {
		logger.warn(`winClose gagal: ${formatError(e)}`);
	}
}

/**
 * Capture screenshot via PowerShell + .NET System.Drawing.
 * Fallback kalau library AutoIt tidak expose _ScreenCapture_Capture.
 * Mengembalikan Buffer PNG, atau null kalau gagal.
 *
 * @returns {Promise<Buffer | null>}
 */
async function captureViaPowerShell() {
	const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
[System.Convert]::ToBase64String($ms.ToArray())
$g.Dispose()
$bmp.Dispose()
$ms.Dispose()
`;
	try {
		const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', psScript], {
			windowsHide: true,
			maxBuffer: 50 * 1024 * 1024
		});
		const trimmed = stdout.trim();
		if (!trimmed) return null;
		return Buffer.from(trimmed, 'base64');
	} catch (/** @type {unknown} */ e) {
		logger.debug(`PowerShell capture gagal: ${formatError(e)}`);
		return null;
	}
}

/**
 * Capture screenshot window dan simpan ke logs/errors/<timestamp>-<target>.png.
 * Silent fail — tidak throw kalau capture gagal (best-effort debugging tool).
 *
 * @param {string} winTitle
 * @param {string} [target]  untuk nama file
 * @returns {Promise<string | null>} path file yang disimpan, atau null
 */
export async function captureErrorScreenshot(winTitle, target = 'unknown') {
	try {
		await mkdir(errorLogsDir, { recursive: true });
	} catch {
		// ignore
	}

	/** @type {Buffer | null} */
	let png = null;
	try {
		const botAny = /** @type {any} */ (bot);
		if (typeof botAny.screenshot === 'function') {
			const r = botAny.screenshot(winTitle);
			png = Buffer.isBuffer(r) ? r : r instanceof Promise ? Buffer.from(await r) : null;
		} else if (typeof botAny._ScreenCapture_Capture === 'function') {
			const r = botAny._ScreenCapture_Capture(winTitle);
			png = Buffer.isBuffer(r) ? r : r instanceof Promise ? Buffer.from(await r) : null;
		} else {
			png = await captureViaPowerShell();
		}
	} catch (/** @type {unknown} */ e) {
		logger.debug(`Capture screenshot gagal: ${formatError(e)}`);
		return null;
	}

	if (!png || png.length === 0) {
		logger.warn(`Screenshot kosong untuk window '${winTitle}'`);
		return null;
	}

	try {
		const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}-${target}.png`;
		const filepath = path.join(errorLogsDir, filename);
		await writeFile(filepath, png);
		logger.info(`Screenshot error disimpan: ${filepath}`);
		return filepath;
	} catch (/** @type {unknown} */ e) {
		logger.warn(`Gagal menyimpan screenshot: ${formatError(e)}`);
		return null;
	}
}

/**
 @typedef {{
   WIN_TITLE: string;
   INS_PATH: string;
   USERNAME?: string;
   PASSWORD?: string;
   MOVE_LEFT: number;
   MOVE_DOWN: number;
 }}
 TargetConfig
 */
