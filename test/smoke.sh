#!/usr/bin/env bash
# Smoke test untuk apm-jkn-bot.
# Prasyarat: server harus sudah berjalan di port yang dikonfigurasi (.env SERVER_PORT).
# Pakai: bash test/smoke.sh
set -u

PORT="${SERVER_PORT:-3684}"
BASE="http://127.0.0.1:${PORT}"
PASS=0
FAIL=0
FAILED_TESTS=()

# cetak hasil per test
# usage: run_test "nama_test" "expected_status_code" curl args...
run_test() {
	local name="$1"
	local expected="$2"
	shift 2
	local got
	got=$(curl -s -o /tmp/smoke_body.json -w "%{http_code}" "$@" 2>/dev/null || echo "000")
	if [[ "$got" == "$expected" ]]; then
		echo "  ✓ ${name} (${got})"
		PASS=$((PASS + 1))
	else
		echo "  ✗ ${name} — expected ${expected}, got ${got}"
		echo "    body: $(cat /tmp/smoke_body.json 2>/dev/null | head -c 200)"
		FAIL=$((FAIL + 1))
		FAILED_TESTS+=("${name}")
	fi
}

echo "==> Smoke test untuk ${BASE}"

# 0. Health check
run_test "GET / (info)" 200 "${BASE}/"

# 1. default target (FP) — test_load
run_test "default FP test_load" 201 -X POST "${BASE}/" \
	-H "Content-Type: application/x-www-form-urlencoded" \
	-d "action=test_load"

# Catatan: test di environment non-Windows akan gagal di node-autoit-koffi.
# Test ini di sini hanya memastikan server merespons dengan request yang valid.

# 2. target=frista — stub (gagal terarah dengan 500)
run_test "FRISTA stub" 500 -X POST "${BASE}/" \
	-H "Content-Type: application/x-www-form-urlencoded" \
	-d "action=scan&target=frista"

# 3. invalid target
run_test "invalid target" 400 -X POST "${BASE}/" \
	-H "Content-Type: application/x-www-form-urlencoded" \
	-d "action=scan&target=foo"

# 4. invalid action
run_test "invalid action" 400 -X POST "${BASE}/" \
	-H "Content-Type: application/x-www-form-urlencoded" \
	-d "action=foo"

# 5. missing required field untuk action=scan di fp
run_test "scan tanpa card_number" 400 -X POST "${BASE}/" \
	-H "Content-Type: application/x-www-form-urlencoded" \
	-d "action=scan&target=fp"

# 6. close action
run_test "close action" 201 -X POST "${BASE}/" \
	-H "Content-Type: application/x-www-form-urlencoded" \
	-d "action=close&target=fp"

# 7. hide action
run_test "hide action" 201 -X POST "${BASE}/" \
	-H "Content-Type: application/x-www-form-urlencoded" \
	-d "action=hide&target=fp"

# 8. JSON body
run_test "JSON body" 201 -X POST "${BASE}/" \
	-H "Content-Type: application/json" \
	-d '{"action":"close","target":"fp"}'

# 9. method not found
run_test "method not allowed" 404 -X PUT "${BASE}/"

echo ""
echo "==> Hasil: ${PASS} passed, ${FAIL} failed"
if [[ ${FAIL} -gt 0 ]]; then
	echo "Test yang gagal:"
	for t in "${FAILED_TESTS[@]}"; do echo "  - ${t}"; done
	exit 1
fi
exit 0
