//@ts-check
import bot from 'node-autoit-koffi';
import { logger } from '../logger.js';
import { BotError } from '../errors.js';
import { delay, ensureWindow, forceClose } from './helpers.js';

/** @typedef {import('./helpers.js').TargetConfig} TargetConfig */

const LOGIN_SETTLE_MS = 3000;
const POST_LOGIN_DELAY_MS = 2000;

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
	const already = await ensureWindow(cfg);
	if (!already) {
		await loginFrista(cfg, instance);
		await delay(POST_LOGIN_DELAY_MS);
	}
	await forceClose(cfg);
	logger.info('frista testLoad selesai');
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
	const already = await ensureWindow(cfg);
	if (!already) {
		await loginFrista(cfg, instance);
		await delay(POST_LOGIN_DELAY_MS);
	}

	const title = cfg.WIN_TITLE;

	if (params.card_number) {
		await bot.send('^a{BACKSPACE}');
		await bot.send(params.card_number);
		await delay(300);
	}

	if (params.exit) {
		try {
			logger.info(`[${title}] menunggu window close otomatis...`);
			await bot.winWaitClose(title);
		} catch {
			logger.warn(`[${title}] winWaitClose timeout — window mungkin tidak auto-close`);
		}
	}
	logger.info(`frista scan selesai${params.card_number ? ` (card=${params.card_number})` : ''}`);
}

/**
 * Tutup paksa aplikasi FRISTA.
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 */
export async function close(cfg, instance) {
	instance.abort = true;
	await forceClose(cfg);
	logger.info('frista close selesai');
}

/**
 * No-op untuk FRISTA.
 * @param {TargetConfig} _cfg
 * @param {{ abort: boolean }} instance
 */
export async function hide(_cfg, instance) {
	if (instance.abort) return;
	void _cfg;
	logger.info('frista hide (no-op)');
}

export const frista = { testLoad, scan, close, hide };
