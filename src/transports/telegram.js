//@ts-check
import Transport from 'winston-transport';
import { telegram } from '../telegram.js';

/**
 * Winston transport yang mengirim log error/warn ke Telegram.
 * Menghormati state notificationEnabled (on/off via /on /off command).
 * Rate limit: 1 pesan per detik (Telegram API limit safe).
 */
export class TelegramTransport extends Transport {
	/**
	 * @param {ConstructorParameters<typeof Transport>[0]} [opts]
	 */
	constructor(opts = {}) {
		super(opts);
		/** @type {number} */
		this._lastSent = 0;
		/** @type {ReturnType<typeof setTimeout> | null} */
		this._queuedTimer = null;
		/** @type {any[]} */
		this._queue = [];
	}

	/**
	 * @param {any} info
	 * @param {() => void} callback
	 */
	log(info, callback) {
		setImmediate(() => this.emit('logged', info));

		const level = info.level;
		if (level !== 'error' && level !== 'warn') {
			callback();
			return;
		}

		if (!telegram.isNotificationEnabled()) {
			callback();
			return;
		}

		const message = info.message ?? '';
		this._queue.push({ level, message });
		this._schedule();

		callback();
	}

	_schedule() {
		if (this._queuedTimer) return;
		const delay = Math.max(0, 1000 - (Date.now() - this._lastSent));
		this._queuedTimer = setTimeout(() => {
			this._queuedTimer = null;
			this._flush();
		}, delay);
	}

	_flush() {
		if (this._queue.length === 0) return;
		const item = this._queue.shift();
		if (!item) return;
		this._lastSent = Date.now();
		// Fire-and-forget; error handled inside sendLog
		telegram.sendLog(item.level, item.message).catch(() => {});

		// Jika masih ada antrian, jadwalkan lagi
		if (this._queue.length > 0) {
			this._schedule();
		}
	}
}
