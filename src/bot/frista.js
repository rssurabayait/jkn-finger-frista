//@ts-check
import bot from 'node-autoit-koffi';
import { logger } from '../logger.js';
import { BotError } from '../errors.js';
import { delay, ensureWindow, forceClose, clickOffset } from './helpers.js';

/** @typedef {import('./helpers.js').TargetConfig} TargetConfig */

const LOGIN_SETTLE_MS = 3000;
const POST_LOGIN_DELAY_MS = 2000;
const BETWEEN_FIELD_DELAY_MS = 300;

/**
 * Login FRISTA — username + password + klik login.
 * Offset diambil dari cfg.OFFSETS (env).
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 */
async function loginFrista(cfg, instance) {
	if (!cfg.USERNAME || !cfg.PASSWORD) {
		throw new BotError('FRISTA_USERNAME dan FRISTA_PASSWORD wajib diisi untuk login');
	}
	if (instance.abort) return;

	const o = cfg.OFFSETS || {};
	const title = cfg.WIN_TITLE;

	// Username
	await clickOffset(cfg, o.USERNAME_FIELD, 'USERNAME_FIELD');
	await bot.send('^a{BACKSPACE}');
	await bot.send(cfg.USERNAME);
	await delay(BETWEEN_FIELD_DELAY_MS);

	// Password
	await clickOffset(cfg, o.PASSWORD_FIELD, 'PASSWORD_FIELD');
	await bot.send('^a{BACKSPACE}');
	await bot.send(cfg.PASSWORD);
	await delay(BETWEEN_FIELD_DELAY_MS);

	// Login button
	await clickOffset(cfg, o.LOGIN_BUTTON, 'LOGIN_BUTTON');
	logger.info(`[${title}] menunggu ${LOGIN_SETTLE_MS}ms untuk proses login...`);
	await delay(LOGIN_SETTLE_MS);
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

	const o = cfg.OFFSETS || {};
	const title = cfg.WIN_TITLE;

	if (params.card_number) {
		await clickOffset(cfg, o.CARD_INPUT, 'CARD_INPUT');
		await bot.send('^a{BACKSPACE}');
		await bot.send(params.card_number);
		await delay(BETWEEN_FIELD_DELAY_MS);
	}

	await clickOffset(cfg, o.SCAN_BUTTON, 'SCAN_BUTTON');

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
 * Tutup paksa aplikasi FRISTA. Set abort flag agar loop/interrupt berjalan.
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 */
export async function close(cfg, instance) {
	instance.abort = true;
	await forceClose(cfg);
	logger.info('frista close selesai');
}

/**
 * Bersihkan state input & toggle on-top. Untuk face-recognition app, ini no-op
 * karena tidak ada konsep window "hide" yang masuk akal. Override kalau perlu.
 * @param {TargetConfig} _cfg
 * @param {{ abort: boolean }} instance
 */
export async function hide(_cfg, instance) {
	if (instance.abort) return;
	// no-op: FRISTA face-recognition app tidak butuh hide
	void _cfg;
	logger.info('frista hide (no-op)');
}

export const frista = { testLoad, scan, close, hide };
