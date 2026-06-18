//@ts-check
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { config } from './config.js';
import { logger } from './logger.js';
import { AppError, ValidationError } from './errors.js';
import { handle } from './bot/index.js';
import { telegram } from './telegram.js';

const HOST = '127.0.0.1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

const requestSchema = z
	.object({
		action: z.enum(['scan', 'test_load', 'close', 'hide']),
		target: z.enum(['fp', 'frista']).default('fp'),
		username: z.string().optional(),
		password: z.string().optional(),
		card_number: z.string().optional(),
		exit: z
			.union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0'), z.literal('')])
			.optional()
			.transform((v) => v === true || v === 'true' || v === '1'),
		wait: z.coerce.number().int().nonnegative().optional()
	})
	.passthrough();

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, any>>}
 */
function readBody(req) {
	return new Promise((resolve, reject) => {
		/** @type {Buffer[]} */
		const chunks = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			const raw = Buffer.concat(chunks).toString('utf8');
			const ct = (req.headers['content-type'] || '').toLowerCase();
			if (!raw) return resolve({});
			if (ct.includes('application/json')) {
				try {
					return resolve(JSON.parse(raw));
				} catch {
					return reject(new ValidationError('Body bukan JSON valid'));
				}
			}
			// default: form-urlencoded
			/** @type {Record<string, any>} */
			const out = {};
			for (const [k, v] of new URLSearchParams(raw)) {
				out[k] = v;
			}
			resolve(out);
		});
		req.on('error', reject);
	});
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {any} [data]
 */
function json(res, status, data) {
	const body = data === undefined ? '' : JSON.stringify(data);
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Content-Length': Buffer.byteLength(body)
	});
	res.end(body);
}

/**
 * Sanitasi params untuk logging: hapus field sensitif (password).
 * @param {Record<string, any>} [params]
 */
function sanitizeForLog(params) {
	if (!params) return {};
	const { password, ...rest } = params;
	if (password !== undefined) rest.password = '***';
	return rest;
}

const server = createServer(async (req, res) => {
	const startTime = Date.now();
	const url = new URL(req.url || '/', `http://${HOST}`);

	// CORS
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		return res.end();
	}

	// Log request masuk
	logger.info(`→ ${req.method} ${url.pathname}`);

	try {
		if (req.method === 'GET' && url.pathname === '/') {
			const responseData = {
				name: 'apm-jkn-bot',
				version: pkg.version,
				message: 'Layanan APM JKN siap. Kirim POST untuk trigger aksi.',
				targets: ['fp', 'frista'],
				actions: ['scan', 'test_load', 'close', 'hide']
			};
			json(res, 200, responseData);
			logger.info(`← GET / 200 (${Date.now() - startTime}ms)`);
			return;
		}

		if (req.method === 'POST' && url.pathname === '/') {
			const body = await readBody(req);
			const params = requestSchema.parse(body);
			logger.debug(`POST / body=${JSON.stringify(sanitizeForLog(params))}`);
			await handle(params);
			json(res, 201, { message: 'OK' });
			logger.info(`← POST / 201 target=${params.target} action=${params.action} (${Date.now() - startTime}ms)`);
			return;
		}

		throw new AppError(`Not found: ${req.method} ${url.pathname}`, { status: 404, code: 'NOT_FOUND' });
	} catch (/** @type {unknown} */ e) {
		const causeMessage = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Internal server error';
		const err = e instanceof AppError ? e : new AppError(causeMessage, { cause: e });
		const detail = err.cause instanceof z.ZodError ? err.cause.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : undefined;
		logger.error(`[${err.code}] ${err.message}${detail ? ` (${detail})` : ''}`);
		json(res, err.status, { message: err.message, code: err.code, ...(detail ? { detail } : {}) });
		const lvl = err.status >= 500 ? 'error' : 'warn';
		logger[lvl](`← ${req.method} ${url.pathname} ${err.status} (${Date.now() - startTime}ms)`);
	}
});

server.on('error', (err) => {
	logger.error(`Server error: ${err.message}`);
});

server.listen(config.SERVER_PORT, HOST, () => {
	logger.info(`Server running at http://${HOST}:${config.SERVER_PORT}`);
	telegram.sendStartup().catch(() => {});
});

// Tangani exception tak tertangkap agar tidak silent-crash
process.on('uncaughtException', (/** @type {NodeJS.ErrnoException | Error} */ err) => {
	const e = err instanceof Error ? err : new Error(String(err));
	logger.error(`uncaughtException: ${e.message}\n${e.stack}`);
});
process.on('unhandledRejection', (/** @type {unknown} */ err) => {
	const message = err instanceof Error ? err.message : String(err);
	logger.error(`unhandledRejection: ${message}`);
});

process.on('SIGINT', () => {
	telegram.sendShutdown().finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
	telegram.sendShutdown().finally(() => process.exit(0));
});

// Inisialisasi Telegram bot (setelah logger siap)
telegram.init();
