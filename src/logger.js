//@ts-check
import { createLogger, format, transports } from 'winston';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.resolve(__dirname, '..', 'logs');

try {
	fs.mkdirSync(logsDir, { recursive: true });
} catch {
	// ignore
}

const level = process.env.LOG_LEVEL || 'info';

const transportsList = [
	new transports.Console(),
	new transports.File({
		filename: path.join(logsDir, 'app.log'),
		maxsize: 1_048_576,
		maxFiles: 5
	})
];

// Lazy load TelegramTransport + config untuk menghindari circular import
// (config.js -> logger.js -> config.js).
// Kita tambah transport ke logger yang sudah ada setelah init selesai,
// supaya tidak memblokir export logger (logger siap pakai lebih awal).
async function maybeAddTelegramTransport() {
	if (process.env.TELEGRAM_ENABLED !== 'true') return;
	try {
		const [{ config }, { TelegramTransport }] = await Promise.all([import('./config.js'), import('./transports/telegram.js')]);
		if (config.TELEGRAM_ENABLED) {
			// add() langsung ke instance, tidak ke array transports (yang sudah dipakai createLogger)
			// @ts-ignore - Winston add() adalah method built-in
			logger.add(new TelegramTransport());
		}
	} catch (/** @type {unknown} */ e) {
		// Logger belum siap pakai, fallback ke console.error
		// eslint-disable-next-line no-console
		console.error('Gagal memuat TelegramTransport:', e instanceof Error ? e.message : String(e));
	}
}

export const logger = createLogger({
	level,
	format: format.combine(
		format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
		format.errors({ stack: true }),
		format.printf(({ timestamp, level, message, stack }) => {
			const head = `[${timestamp}] ${level}: ${message}`;
			return stack ? `${head}\n${stack}` : head;
		})
	),
	transports: transportsList
});

// Fire and forget; logger tetap jalan meski Telegram gagal dimuat
maybeAddTelegramTransport();
