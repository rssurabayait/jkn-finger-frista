//@ts-check
import { z } from 'zod';
import { logger } from './logger.js';
import { ConfigError } from './errors.js';

/**
 * Schema helper: integer dengan default value (handle empty string dari .env).
 * @param {number} def
 */
const num = (def) => z.union([z.literal('').transform(() => def), z.coerce.number().int()]).default(def);

const str = z.string().min(1, { message: 'tidak boleh kosong' });

const targetSchema = z
	.object({
		WIN_TITLE: str,
		INS_PATH: str,
		USERNAME: z.string().optional(),
		PASSWORD: z.string().optional(),
		MOVE_LEFT: num(680),
		MOVE_DOWN: num(600)
	})
	.passthrough();

const envSchema = z
	.object({
		SERVER_PORT: num(3684),
		LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
		SIMRS_WIN_TITLE: z.string().optional(),
		targets: z.object({
			fp: targetSchema,
			frista: targetSchema
		})
	})
	.passthrough();

function loadFromEnv() {
	return {
		SERVER_PORT: process.env.SERVER_PORT,
		LOG_LEVEL: process.env.LOG_LEVEL,
		SIMRS_WIN_TITLE: process.env.SIMRS_WIN_TITLE,
		targets: {
			fp: {
				WIN_TITLE: process.env.FP_WIN_TITLE,
				INS_PATH: process.env.FP_INS_PATH,
				USERNAME: process.env.FP_USERNAME,
				PASSWORD: process.env.FP_PASSWORD,
				MOVE_LEFT: process.env.FP_MOVE_LEFT,
				MOVE_DOWN: process.env.FP_MOVE_DOWN
			},
			frista: {
				WIN_TITLE: process.env.FRISTA_WIN_TITLE,
				INS_PATH: process.env.FRISTA_INT_PATH ?? process.env.FRISTA_INS_PATH,
				USERNAME: process.env.FRISTA_USERNAME,
				PASSWORD: process.env.FRISTA_PASSWORD,
				MOVE_LEFT: process.env.FRISTA_MOVE_LEFT,
				MOVE_DOWN: process.env.FRISTA_MOVE_DOWN
			}
		}
	};
}

function validate() {
	const raw = loadFromEnv();
	const result = envSchema.safeParse(raw);
	if (!result.success) {
		const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
		logger.error(`Konfigurasi .env tidak valid:\n${issues}`);
		throw new ConfigError('Konfigurasi .env tidak valid. Periksa pesan di atas.');
	}
	return /** @type {z.infer<typeof envSchema>} */ (result.data);
}

export const config = validate();
export const TARGETS = /** @type {const} */ (['fp', 'frista']);
export const ACTIONS = /** @type {const} */ (['scan', 'test_load', 'close', 'hide']);
