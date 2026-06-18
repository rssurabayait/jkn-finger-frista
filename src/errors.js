//@ts-check

export class AppError extends Error {
	/**
	 * @param {string} message
	 * @param {{ status?: number; code?: string; cause?: unknown }} [opts]
	 */
	constructor(message, { status = 500, code = 'INTERNAL', cause } = {}) {
		super(message);
		this.name = this.constructor.name;
		this.status = status;
		this.code = code;
		if (cause !== undefined) this.cause = cause;
	}
}

export class ValidationError extends AppError {
	/**
	 * @param {string} message
	 * @param {{ code?: string; cause?: unknown }} [opts]
	 */
	constructor(message, opts = {}) {
		super(message, { ...opts, status: 400, code: opts.code || 'VALIDATION' });
	}
}

export class BotError extends AppError {
	/**
	 * @param {string} message
	 * @param {{ code?: string; cause?: unknown }} [opts]
	 */
	constructor(message, opts = {}) {
		super(message, { ...opts, status: 500, code: opts.code || 'BOT' });
	}
}

export class ConfigError extends AppError {
	/**
	 * @param {string} message
	 * @param {{ cause?: unknown }} [opts]
	 */
	constructor(message, opts = {}) {
		super(message, { ...opts, status: 500, code: 'CONFIG' });
	}
}
