//@ts-check
/**
 * Script test untuk Telegram integration di Linux/Mac.
 *
 * KENAPA perlu script terpisah:
 * - server.js import bot/index.js → fp.js & frista.js → node-autoit-koffi
 * - node-autoit-koffi adalah native library Windows (.dll), tidak jalan di Linux
 * - Script ini TIDAK import server.js, hanya test telegram + logger + config
 *
 * Cara pakai:
 *   node --env-file=.env scripts/test-telegram.js
 */

import { telegram } from '../src/telegram.js';
import { logger } from '../src/logger.js';
import { config } from '../src/config.js';

const log = (emoji, msg) => console.log(`${emoji}  ${msg}`);

async function main() {
	log('🚀', 'Memulai test Telegram integration');
	log('ℹ️ ', `MACHINE_NAME: ${config.MACHINE_NAME}`);
	log('ℹ️ ', `TELEGRAM_ENABLED: ${config.TELEGRAM_ENABLED}`);
	log('ℹ️ ', `CHAT_ID: ${config.TELEGRAM_CHAT_ID}`);

	if (!config.TELEGRAM_ENABLED) {
		log('❌', 'TELEGRAM_ENABLED=false di .env — set true dulu untuk test');
		process.exit(1);
	}

	// Init bot DULU sebelum kirim pesan apapun
	log('🤖', 'Init bot...');
	telegram.init();
	// Tunggu sebentar agar bot siap
	await sleep(2000);

	// Step 1: Test sendStartup
	log('📤', 'Test 1: Kirim pesan "Server started"...');
	try {
		await telegram.sendStartup();
		log('✅', 'sendStartup berhasil');
	} catch (e) {
		log('❌', `sendStartup gagal: ${e instanceof Error ? e.message : String(e)}`);
	}

	await sleep(2000);

	// Step 2: Test sendLog (level error)
	log('📤', 'Test 2: Kirim log error...');
	try {
		await telegram.sendLog('error', 'Ini adalah test error log dari script test-telegram.js');
		log('✅', 'sendLog error berhasil');
	} catch (e) {
		log('❌', `sendLog error gagal: ${e instanceof Error ? e.message : String(e)}`);
	}

	await sleep(2000);

	// Step 3: Test sendLog (level warn)
	log('📤', 'Test 3: Kirim log warn...');
	try {
		await telegram.sendLog('warn', 'Ini adalah test warning log');
		log('✅', 'sendLog warn berhasil');
	} catch (e) {
		log('❌', `sendLog warn gagal: ${e instanceof Error ? e.message : String(e)}`);
	}

	await sleep(2000);

	// Step 4: Test isNotificationEnabled
	log('🔍', 'Test 4: Cek state notifikasi...');
	const enabled = telegram.isNotificationEnabled();
	log(enabled ? '✅' : '⚠️ ', `Notification enabled: ${enabled}`);

	// Step 5: Test Winston integration (logger.error)
	log('📤', 'Test 5: Trigger logger.error (via Winston)...');
	logger.error('Test error dari logger Winston — harusnya muncul di Telegram');
	log('✅', 'logger.error dipanggil, cek Telegram');

	await sleep(2000);

	// Step 6: Bot sudah jalan dari init() di awal, tinggal test commands
	log('🤖', 'Test 6: Bot sudah polling. Coba kirim /status /on /off /logs /help ke bot di Telegram');
	log('ℹ️ ', 'Bot akan jalan 30 detik lalu exit.');

	await sleep(30000);

	log('👋', 'Test selesai, exit');
	process.exit(0);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((e) => {
	console.error('Fatal error:', e);
	process.exit(1);
});
