//@ts-check
import { createServer } from 'node:http';
import { z } from 'zod';
import { config } from './config.js';
import { logger } from './logger.js';
import { AppError, ValidationError } from './errors.js';
import { handle } from './bot/index.js';

const HOST = '127.0.0.1';

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

const server = createServer(async (req, res) => {
	// CORS
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		return res.end();
	}

	try {
		const url = new URL(req.url || '/', `http://${HOST}`);

		if (req.method === 'GET' && url.pathname === '/') {
			return json(res, 200, {
				name: 'apm-jkn-bot',
				version: process.env.npm_package_version || '0.0.0',
				message: 'Layanan APM JKN siap. Kirim POST untuk trigger aksi.',
				targets: ['fp', 'frista'],
				actions: ['scan', 'test_load', 'close', 'hide']
			});
		}

		if (req.method === 'POST' && url.pathname === '/') {
			const body = await readBody(req);
			const params = requestSchema.parse(body);
			await handle(params);
			return json(res, 201, { message: 'OK' });
		}

		throw new AppError(`Not found: ${req.method} ${url.pathname}`, { status: 404, code: 'NOT_FOUND' });
	} catch (/** @type {unknown} */ e) {
		const causeMessage = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Internal server error';
		const err = e instanceof AppError ? e : new AppError(causeMessage, { cause: e });
		const detail = err.cause instanceof z.ZodError ? err.cause.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : undefined;
		logger.error(`[${err.code}] ${err.message}${detail ? ` (${detail})` : ''}`);
		return json(res, err.status, { message: err.message, code: err.code, ...(detail ? { detail } : {}) });
	}
});

server.on('error', (err) => {
	logger.error(`Server error: ${err.message}`);
});

server.listen(config.SERVER_PORT, HOST, () => {
	logger.info(`Server running at http://${HOST}:${config.SERVER_PORT}`);
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
