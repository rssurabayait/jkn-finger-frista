//@ts-check
import TelegramBot from 'node-telegram-bot-api';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.resolve(__dirname, '..', 'logs');
const appLogPath = path.join(logsDir, 'app.log');

/** @type {TelegramBot | null} */
let bot = null;
let notificationEnabled = true;
const serverStartTime = Date.now();

/**
 * Format uptime human readable.
 * @param {number} ms
 */
function formatUptime(ms) {
	const sec = Math.floor(ms / 1000);
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = sec % 60;
	const parts = [];
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	parts.push(`${s}s`);
	return parts.join(' ');
}

/**
 * @param {string} text
 */
async function safeSend(text) {
	if (!config.TELEGRAM_ENABLED) return;
	if (!config.TELEGRAM_BOT_TOKEN) {
		logger.warn('safeSend dilewati: TELEGRAM_BOT_TOKEN kosong');
		return;
	}
	if (!config.TELEGRAM_CHAT_ID) {
		logger.warn('safeSend dilewati: TELEGRAM_CHAT_ID kosong');
		return;
	}
	if (!bot) {
		logger.warn(`safeSend dilewati: bot belum diinisialisasi. Pesan yang tidak terkirim: ${text.slice(0, 100)}`);
		return;
	}
	// Cegah infinite loop: jangan kirim pesan yang berisi error/warn Telegram
	if (text.includes('Telegram ') || text.includes('ETELEGRAM')) {
		return;
	}
	try {
		const result = await bot.sendMessage(config.TELEGRAM_CHAT_ID, text, { parse_mode: 'HTML' });
		logger.debug(`Telegram sent message_id=${result.message_id}: ${text.slice(0, 80)}`);
	} catch (/** @type {unknown} */ e) {
		const msg = e instanceof Error ? e.message : String(e);
		logger.warn(`Telegram sendMessage gagal: ${msg}. Pesan: ${text.slice(0, 100)}`);
	}
}

/**
 * Baca N baris terakhir dari file log.
 * @param {number} [count=10]
 */
function readLastLogs(count = 10) {
	try {
		if (!fs.existsSync(appLogPath)) return 'File log belum ada.';
		const content = fs.readFileSync(appLogPath, 'utf-8');
		const lines = content.split('\n').filter((l) => l.trim().length > 0);
		const last = lines.slice(-count).join('\n');
		return last || 'Log kosong.';
	} catch (/** @type {unknown} */ e) {
		const msg = e instanceof Error ? e.message : String(e);
		return `Gagal membaca log: ${msg}`;
	}
}

export const telegram = {
	/**
	 * @returns {boolean}
	 */
	isNotificationEnabled() {
		return notificationEnabled;
	},

	/**
	 * @param {string} level
	 * @param {string} message
	 */
	async sendLog(level, message) {
		if (!notificationEnabled) return;
		if (!config.TELEGRAM_ENABLED || !config.TELEGRAM_BOT_TOKEN) return;
		const prefix = `[${config.MACHINE_NAME}] ${level.toUpperCase()}`;
		// Telegram max 4096 chars
		const text = `${prefix}: ${message}`.slice(0, 4000);
		await safeSend(text);
	},

	async sendStartup() {
		if (!config.TELEGRAM_ENABLED) return;
		await safeSend(
			`[${config.MACHINE_NAME}] Server started di http://${'127.0.0.1'}:${config.SERVER_PORT}`
		);
	},

	async sendShutdown() {
		if (!config.TELEGRAM_ENABLED) return;
		await safeSend(`[${config.MACHINE_NAME}] Server shutting down (uptime: ${formatUptime(Date.now() - serverStartTime)})`);
	},

	startHeartbeat() {
		if (!config.TELEGRAM_ENABLED) return;
		setInterval(async () => {
			if (!notificationEnabled) return;
			await safeSend(
				`[${config.MACHINE_NAME}] Heartbeat: OK (uptime: ${formatUptime(Date.now() - serverStartTime)})`
			);
		}, 5 * 60 * 1000);
	},

	init() {
		if (!config.TELEGRAM_ENABLED) {
			logger.info('Telegram integration disabled (TELEGRAM_ENABLED=false)');
			return;
		}
		if (!config.TELEGRAM_BOT_TOKEN) {
			logger.warn('TELEGRAM_ENABLED=true tapi TELEGRAM_BOT_TOKEN kosong. Telegram dilewati.');
			return;
		}

		try {
			bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
			notificationEnabled = true;
			logger.info(`Telegram bot aktif untuk [${config.MACHINE_NAME}]`);

			bot.onText(/\/on/, (msg) => {
				notificationEnabled = true;
				bot?.sendMessage(msg.chat.id, `[${config.MACHINE_NAME}] Notifikasi error: ON`);
			});

			bot.onText(/\/off/, (msg) => {
				notificationEnabled = false;
				bot?.sendMessage(msg.chat.id, `[${config.MACHINE_NAME}] Notifikasi error: OFF`);
			});

			bot.onText(/\/status/, (msg) => {
				const mem = process.memoryUsage();
				const text = [
					`[${config.MACHINE_NAME}] Status Server`,
					``,
					`• Port: ${config.SERVER_PORT}`,
					`• Uptime: ${formatUptime(Date.now() - serverStartTime)}`,
					`• Notifikasi: ${notificationEnabled ? 'ON' : 'OFF'}`,
					`• Log level: ${config.LOG_LEVEL}`,
					`• PID: ${process.pid}`,
					`• RSS: ${Math.round(mem.rss / 1024 / 1024)} MB`
				].join('\n');
				bot?.sendMessage(msg.chat.id, text);
			});

			bot.onText(/\/logs (\d+)/, (msg, match) => {
				const count = parseInt(/** @type {RegExpMatchArray} */ (match)[1], 10);
				const logs = readLastLogs(Math.min(count, 50));
				bot?.sendMessage(msg.chat.id, `[${config.MACHINE_NAME}] Last ${count} logs:\n\n${logs.slice(0, 3500)}`);
			});

			bot.onText(/\/logs$/, (msg) => {
				const logs = readLastLogs(10);
				bot?.sendMessage(msg.chat.id, `[${config.MACHINE_NAME}] Last 10 logs:\n\n${logs.slice(0, 3500)}`);
			});

			bot.onText(/\/help/, (msg) => {
				const text = [
					`[${config.MACHINE_NAME}] Perintah tersedia:`,
					``,
					`/on - Aktifkan notifikasi error`,
					`/off - Matikan notifikasi error`,
					`/status - Status server`,
					`/logs - 10 log terakhir`,
					`/logs 20 - 20 log terakhir`,
					`/help - Tampilkan bantuan`
				].join('\n');
				bot?.sendMessage(msg.chat.id, text);
			});

			bot.on('polling_error', (err) => {
				// 409 Conflict: another polling session active — stop & retry after 30s
				if (err.message.includes('409') || err.message.includes('Conflict')) {
					logger.warn('Telegram 409 Conflict — stopping polling, retry in 30s');
					bot?.stopPolling();
					setTimeout(() => {
						bot?.startPolling();
					}, 30_000);
				} else {
					logger.warn(`Telegram polling error: ${err.message}`);
				}
			});

			bot.on('error', (err) => {
				logger.warn(`Telegram error: ${err.message}`);
			});

			this.startHeartbeat();
		} catch (/** @type {unknown} */ e) {
			const msg = e instanceof Error ? e.message : String(e);
			logger.error(`Gagal inisialisasi Telegram bot: ${msg}`);
		}
	}
};
