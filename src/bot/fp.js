//@ts-check
import bot from 'node-autoit-koffi';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { BotError } from '../errors.js';
import { delay, ensureWindow, forceClose, withAbort, toInt } from './helpers.js';

/** @typedef {import('./helpers.js').TargetConfig} TargetConfig */

const LOGIN_SETTLE_MS = 1000;
const WINDOW_REPOSITION_MS = 3000;
const DEFAULT_WAIT_MS = 5000;

/**
 * Buka aplikasi FP, login, lalu tutup. Dipakai untuk verifikasi kredensial.
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 */
export async function testLoad(cfg, instance) {
	if (instance.abort) return;
	if (!cfg.USERNAME || !cfg.PASSWORD) {
		throw new BotError('FP_USERNAME dan FP_PASSWORD wajib diisi di .env untuk action=test_load');
	}
	logger.info('[fp] testLoad starting');
	const already = await ensureWindow(cfg);
	if (!already) {
		await typeCredentials(cfg);
		await delay(DEFAULT_WAIT_MS);
	}
	await bot.winMove(cfg.WIN_TITLE, '', -550, 200);
	await delay(WINDOW_REPOSITION_MS);
	await forceClose(cfg);
	logger.info('[fp] testLoad selesai');
}

/**
 * Scan nomor kartu BPJS. Default flow: buka app (kalau belum), login (kalau baru), isi card_number, tunggu window close kalau exit=true.
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 * @param {{ card_number?: string; exit?: boolean; wait?: number }} params
 */
export async function scan(cfg, instance, params) {
	if (!params.card_number) {
		throw new BotError('card_number wajib untuk action=scan');
	}
	if (instance.abort) return;
	if (!cfg.USERNAME || !cfg.PASSWORD) {
		throw new BotError('FP_USERNAME dan FP_PASSWORD wajib diisi di .env untuk action=scan');
	}
	logger.info(`[fp] scan starting: card_number=${params.card_number} exit=${params.exit ?? false}`);

	const { move_left: left, move_down: top } = { move_left: cfg.MOVE_LEFT, move_down: cfg.MOVE_DOWN };

	// bring SIMRS on top during prep, then FP takes over
	const simrs = config.SIMRS_WIN_TITLE;
	if (simrs) {
		try {
			await bot.winSetOnTop(simrs, '', 1);
		} catch (/** @type {unknown} */ e) {
			logger.debug(`winSetOnTop(SIMRS, on) gagal: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	const already = await ensureWindow(cfg);

	await bot.winMove(cfg.WIN_TITLE, '', left, top);
	await bot.winActivate(cfg.WIN_TITLE);

	if (simrs) {
		try {
			await bot.winSetOnTop(simrs, '', 0);
		} catch (/** @type {unknown} */ e) {
			logger.debug(`winSetOnTop(SIMRS, off) gagal: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	if (params.exit) {
		await bot.winSetOnTop(cfg.WIN_TITLE, '', 1);
	}

	await bot.winMove(cfg.WIN_TITLE, '', left, top);
	await bot.winActivate(cfg.WIN_TITLE);
	await bot.winWaitActive(cfg.WIN_TITLE);
	await bot.winSetOnTop(cfg.WIN_TITLE, '', 1);

	if (instance.abort) return;

	if (!already) {
		await typeCredentials(cfg);
		await delay(toInt(params.wait, DEFAULT_WAIT_MS));
	}

	// clear & type card number (only if provided)
	if (params.card_number) {
		const cardNumber = params.card_number;
		await withAbort(instance, async () => {
			await bot.send('^a{BACKSPACE}');
			await bot.send(cardNumber);
		});
	}

	const winPos = await bot.winGetPos(cfg.WIN_TITLE);
	if (!winPos) throw new BotError('Gagal membaca posisi window');
	logger.debug(`window pos: ${JSON.stringify(winPos)}`);

	// Untuk saat ini scan selesai setelah input card_number.
	// Penambahan loop klik (mouse) dilakukan di fp.js versi future.
	logger.info(`[fp] scan selesai: card_number=${params.card_number}`);
}

/**
 * Tutup paksa aplikasi FP. Set abort flag agar loop klik lain berhenti.
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 */
export async function close(cfg, instance) {
	logger.info('[fp] close starting');
	instance.abort = true;
	await bot.winActivate(cfg.WIN_TITLE);
	await forceClose(cfg);
	logger.info('[fp] close selesai');
}

/**
 * Bersihkan field input (state preparation), atur window on-top bergantian.
 * @param {TargetConfig} cfg
 * @param {{ abort: boolean }} instance
 */
export async function hide(cfg, instance) {
	if (instance.abort) return;
	logger.info('[fp] hide starting');
	await bot.send('^a{BACKSPACE}');
	const simrs = config.SIMRS_WIN_TITLE;
	if (simrs) {
		await bot.winSetOnTop(cfg.WIN_TITLE, '', 1);
		await bot.winSetOnTop(simrs, '', 1);
		await bot.winSetOnTop(cfg.WIN_TITLE, '', 0);
		await bot.winSetOnTop(simrs, '', 0);
	} else {
		await bot.winSetOnTop(cfg.WIN_TITLE, '', 0);
	}
	logger.info('[fp] hide selesai');
}

/** @param {TargetConfig} cfg */
async function typeCredentials(cfg) {
	if (!cfg.USERNAME || !cfg.PASSWORD) return;
	await bot.send('^a{BACKSPACE}');
	await bot.send(cfg.USERNAME);
	await bot.send('{TAB}');
	await bot.send('^a{BACKSPACE}');
	await bot.send(cfg.PASSWORD);
	await bot.send('{ENTER}');
	await delay(LOGIN_SETTLE_MS);
}

export const fp = { testLoad, scan, close, hide };
