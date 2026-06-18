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
	transports: [
		new transports.Console(),
		new transports.File({
			filename: path.join(logsDir, 'app.log'),
			maxsize: 1_048_576,
			maxFiles: 5
		})
	]
});
