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

/**
 * Daftar nama offset yang dikenali untuk setiap target.
 * Tambahkan di sini kalau target baru butuh field klik tambahan.
 */
export const OFFSET_FIELDS = /** @type {const} */ (['USERNAME_FIELD', 'PASSWORD_FIELD', 'LOGIN_BUTTON', 'CARD_INPUT', 'SCAN_BUTTON']);

/** @typedef {{ x: number, y: number } | undefined} OffsetPair */
const offsetPairSchema = z
	.object({
		x: num(0),
		y: num(0)
	})
	.optional();

/** @returns {z.ZodOptional<z.ZodObject<Record<string, typeof offsetPairSchema>>>} */
function buildOffsetsSchema() {
	/** @type {Record<string, typeof offsetPairSchema>} */
	const shape = {};
	for (const name of OFFSET_FIELDS) {
		shape[name] = offsetPairSchema;
	}
	return z.object(shape).optional();
}

const offsetsSchema = buildOffsetsSchema();

const targetSchema = z
	.object({
		WIN_TITLE: str,
		INS_PATH: str,
		USERNAME: z.string().optional(),
		PASSWORD: z.string().optional(),
		MOVE_LEFT: num(680),
		MOVE_DOWN: num(600),
		OFFSETS: offsetsSchema
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

/**
 * Parse koordinat klik dari env vars dengan konvensi `<TARGET>_OFFSETS_<NAME>_X/Y`.
 * Field yang tidak ada di env akan di-skip (tidak di-include di output).
 * @param {string} targetPrefix  mis. 'FRISTA' atau 'FP'
 * @returns {Record<string, { x: number, y: number }> | undefined}
 */
function loadOffsets(targetPrefix) {
	/** @type {Record<string, { x: number, y: number }>} */
	const out = {};
	for (const name of OFFSET_FIELDS) {
		const xRaw = process.env[`${targetPrefix}_OFFSETS_${name}_X`];
		const yRaw = process.env[`${targetPrefix}_OFFSETS_${name}_Y`];
		const x = xRaw === undefined || xRaw === '' ? undefined : Number(xRaw);
		const y = yRaw === undefined || yRaw === '' ? undefined : Number(yRaw);
		if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
			out[name] = { x, y };
		}
	}
	return Object.keys(out).length ? out : undefined;
}

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
				MOVE_DOWN: process.env.FP_MOVE_DOWN,
				OFFSETS: loadOffsets('FP')
			},
			frista: {
				WIN_TITLE: process.env.FRISTA_WIN_TITLE,
				INS_PATH: process.env.FRISTA_INT_PATH ?? process.env.FRISTA_INS_PATH,
				USERNAME: process.env.FRISTA_USERNAME,
				PASSWORD: process.env.FRISTA_PASSWORD,
				MOVE_LEFT: process.env.FRISTA_MOVE_LEFT,
				MOVE_DOWN: process.env.FRISTA_MOVE_DOWN,
				OFFSETS: loadOffsets('FRISTA')
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
