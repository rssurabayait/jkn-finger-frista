//@ts-check
import bot from 'node-autoit-koffi';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { BotError } from '../errors.js';
import { delay, ensureWindow, forceClose } from './helpers.js';

/** @typedef {import('./helpers.js').TargetConfig} TargetConfig */

const LOGIN_SETTLE_MS = 3000;
const POST_LOGIN_DELAY_MS = 2000;
const NIK_CLICK_X = 1316;
const NIK_CLICK_Y = 428;

/**
 * Isi kredensial via keyboard (Tab navigation, tanpa mouse).
 * Flow: clear → username → Tab → clear → password → Tab → Space (login)
 * @param {TargetConfig} cfg
 */
async function typeCredentials(cfg) {
	if (!cfg.USERNAME || !cfg.PASSWORD) return;
	await bot.send('^a{BACKSPACE}');
	await bot.send(cfg.USERNAME);
	await bot.send('{TAB}');
	await bot.send('^a{BACKSPACE}');
	await bot.send(cfg.PASSWORD);
	await bot.send('{TAB}');
	await bot.send(' ');
	await delay(LOGIN_SETTLE_MS);
}

/**
 * Login FRISTA — keyboard only.
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 */
async function loginFrista(cfg, instance) {
	if (instance.abort) return;
	if (!cfg.USERNAME || !cfg.PASSWORD) {
		throw new BotError('FRISTA_USERNAME dan FRISTA_PASSWORD wajib diisi untuk login');
	}

	await typeCredentials(cfg);
	logger.info(`[${cfg.WIN_TITLE}] login executed`);
}

/**
 * Test load: buka FRISTA, login, lalu tutup. Verifikasi kredensial + layout.
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 */
export async function testLoad(cfg, instance) {
	if (instance.abort) return;
	logger.info('[frista] testLoad starting');
	const already = await ensureWindow(cfg);
	if (!already) {
		await loginFrista(cfg, instance);
		await delay(POST_LOGIN_DELAY_MS);
	}
	await forceClose(cfg);
	logger.info('[frista] testLoad selesai');
}

/**
 * Scan: buka FRISTA, login (kalau belum), input card_number, trigger face recognition.
 * Keyboard only — setelah login, Tab ke NIK → type → Tab → Space (foto).
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 * @param {{ card_number?: string; exit?: boolean; wait?: number }} params
 */
export async function scan(cfg, instance, params) {
	if (instance.abort) return;
	logger.info(`[frista] scan starting: card_number=${params.card_number ?? '-'} exit=${params.exit ?? false}`);
	const already = await ensureWindow(cfg);
	if (!already) {
		await loginFrista(cfg, instance);
		await delay(POST_LOGIN_DELAY_MS);
	}

	const title = cfg.WIN_TITLE;

	if (params.card_number) {
		// Klik field NIK (Tkinter: controlClick/controlFocus tidak work)
		bot.mouseClick('left', NIK_CLICK_X, NIK_CLICK_Y);
		await delay(300);
		bot.winActivate(title);
		await delay(300);
		await bot.send('^a{BACKSPACE}');
		await bot.send(params.card_number);
		await delay(300);
	}

	if (params.exit) {
		try {
			logger.info(`[${title}] menunggu window close otomatis...`);
			await bot.winWaitClose(title);
		} catch (/** @type {unknown} */ e) {
			logger.warn(`[${title}] winWaitClose timeout — window mungkin tidak auto-close (${e instanceof Error ? e.message : String(e)})`);
		}
	}
	logger.info(`[frista] scan selesai${params.card_number ? `: card=${params.card_number}` : ''}`);
}

/**
 * Tutup paksa aplikasi FRISTA.
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 */
export async function close(cfg, instance) {
	logger.info('[frista] close starting');
	instance.abort = true;
	await forceClose(cfg);
	logger.info('[frista] close selesai');
}

/**
 * Sembunyikan window FRISTA — toggle on-top agar SIMRS kembali fokus.
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 */
export async function hide(cfg, instance) {
	if (instance.abort) return;
	logger.info('[frista] hide starting');
	const simrs = config.SIMRS_WIN_TITLE;
	if (simrs) {
		try {
			await bot.winSetOnTop(cfg.WIN_TITLE, '', 1);
			await bot.winSetOnTop(simrs, '', 1);
			await bot.winSetOnTop(cfg.WIN_TITLE, '', 0);
			await bot.winSetOnTop(simrs, '', 0);
		} catch (/** @type {unknown} */ e) {
			logger.debug(`winSetOnTop (dengan SIMRS) gagal: ${e instanceof Error ? e.message : String(e)}`);
		}
	} else {
		try {
			await bot.winSetOnTop(cfg.WIN_TITLE, '', 0);
		} catch (/** @type {unknown} */ e) {
			logger.debug(`winSetOnTop (tanpa SIMRS) gagal: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	logger.info('[frista] hide selesai');
}

export const frista = { testLoad, scan, close, hide };
