//@ts-check
import { config, TARGETS, ACTIONS } from '../config.js';
import { ValidationError, BotError } from '../errors.js';
import { logger } from '../logger.js';
import { captureErrorScreenshot, formatError } from './helpers.js';
import { fp } from './fp.js';
import { frista } from './frista.js';

const handlers = /** @type {const} */ ({ fp, frista });

/** @type {Map<string, { abort: boolean }>} */
const currentBots = new Map();

/**
 * @param {string} target
 * @returns {{ abort: boolean }}
 */
function getInstance(target) {
	let inst = currentBots.get(target);
	if (!inst) {
		inst = { abort: false };
		currentBots.set(target, inst);
	}
	return inst;
}

/**
 * Dispatcher utama. Resolve target → handler → action.
 * @param {{ target?: string; action?: string; [k: string]: any }} params
 */
export async function handle(params) {
	const target = params.target || 'fp';
	const action = params.action;

	if (!ACTIONS.includes(/** @type {any} */ (action))) {
		throw new ValidationError(`Unknown action: ${action}. Pilihan: ${ACTIONS.join(', ')}`);
	}
	if (!TARGETS.includes(/** @type {any} */ (target))) {
		throw new ValidationError(`Unknown target: ${target}. Pilihan: ${TARGETS.join(', ')}`);
	}

	const targetCfg = config.targets[/** @type {'fp'|'frista'} */ (target)];
	if (!targetCfg) {
		throw new BotError(`Konfigurasi target '${target}' tidak ditemukan`);
	}

	const targetKey = /** @type {'fp'|'frista'} */ (target);
	const module = handlers[targetKey];
	const fn = module[/** @type {keyof typeof module} */ (/** @type {any} */ (action))];
	if (typeof fn !== 'function') {
		throw new BotError(`Handler untuk target=${target} action=${action} tidak ada`);
	}

	const instance = getInstance(target);
	logger.info(`dispatch: target=${target} action=${action}`);

	try {
		// Cast params ke any: schema sudah validasi di server.js, di sini kita trust.
		// Per-target handler bisa strict sesuai kebutuhannya masing-masing.
		return await fn(targetCfg, instance, /** @type {any} */ (params));
	} catch (/** @type {unknown} */ e) {
		// Best-effort: capture screenshot kalau ini BotError dan targetCfg punya WIN_TITLE
		if (e instanceof BotError && targetCfg.WIN_TITLE) {
			try {
				await captureErrorScreenshot(targetCfg.WIN_TITLE, target);
			} catch (/** @type {unknown} */ capErr) {
				logger.warn(`captureErrorScreenshot gagal: ${formatError(capErr)}`);
			}
		}
		throw e;
	}
}
