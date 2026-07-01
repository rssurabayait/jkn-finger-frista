#Requires -RunAsAdministrator

param(
	[string]$FP_USERNAME,
	[string]$FP_PASSWORD,
	[string]$FRISTA_USERNAME,
	[string]$FRISTA_PASSWORD,
	[string]$TELEGRAM_BOT_TOKEN,
	[string]$TELEGRAM_CHAT_ID,
	[string]$MACHINE_NAME,
	[switch]$Unattended
)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot
$LogFile = "$ProjectRoot\install.log"

function Log {
	param([string]$Msg, [string]$Color = "White")
	$time = Get-Date -Format "HH:mm:ss"
	Write-Host "$time $Msg" -ForegroundColor $Color
	"$time $Msg" | Out-File -FilePath $LogFile -Append
}

function Refresh-Path {
	$machine = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
	$user = [System.Environment]::GetEnvironmentVariable("PATH", "User")
	$npm = [System.Environment]::GetFolderPath("ApplicationData") + "\npm"
	$env:PATH = "$machine;$user;$npm"
}

function Check-Node {
	try { $v = node -v 2>$null; return $v.TrimStart("v") } catch { return $null }
}

function Check-Pnpm {
	try { pnpm -v 2>$null | Out-Null; return $true } catch { return $false }
}

function Check-PM2 {
	try { pm2 -v 2>$null | Out-Null; return $true } catch { return $false }
}

Log "=== APM JKN Bot Installer ===" Cyan
Log "Project: $ProjectRoot"

# ── 1. Node.js ──
$nodeVer = Check-Node
if (-not $nodeVer) {
	Log "Node.js belum terinstall — download v24.3.0..." Yellow
	$url = "https://nodejs.org/dist/v24.3.0/node-v24.3.0-x64.msi"
	$msi = "$env:TEMP\node-install.msi"
	try {
		Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
		Start-Process msiexec.exe -ArgumentList "/i", $msi, "/passive", "/norestart" -Wait
	} catch {
		Log "Gagal download/install Node.js: $_" Red
		exit 1
	}
	Refresh-Path
	$nodeVer = Check-Node
	if (-not $nodeVer) {
		Log "Node.js gagal terinstall — coba manual" Red
		exit 1
	}
	Log "Node.js v$nodeVer terinstall" Green
} else {
	Log "Node.js v$nodeVer (OK)" Green
}

Refresh-Path

# ── 2. pnpm ──
if (-not (Check-Pnpm)) {
	Log "Aktifkan pnpm via corepack..." Yellow
	try {
		corepack enable
		corepack prepare pnpm@latest --activate
		Refresh-Path
	} catch {
		Log "corepack gagal — coba npm install -g pnpm" Yellow
		npm install -g pnpm
		Refresh-Path
	}
}
$pnpmVer = pnpm -v 2>$null
if ($pnpmVer) { Log "pnpm $pnpmVer (OK)" Green } else { Log "pnpm gagal" Red; exit 1 }

# ── 3. Dependencies ──
if (Test-Path "node_modules") {
	Log "node_modules sudah ada — skip install" Green
} else {
	Log "Install dependencies..." Yellow
	pnpm install --prod 2>>$LogFile
	if ($LASTEXITCODE -ne 0) {
		Log "pnpm install gagal — lihat $LogFile" Red
		exit 1
	}
	Log "Dependencies siap" Green
}

# ── 4. .env ──
if (-not (Test-Path ".env")) {
	if (Test-Path ".env.example") {
		Copy-Item ".env.example" ".env"
		Log ".env dibuat dari .env.example" Yellow
	} else {
		Log ".env.example tidak ditemukan" Red
		exit 1
	}
}

if ($Unattended) {
	$envContent = Get-Content ".env"
	$envContent = $envContent | ForEach-Object {
		$_ -replace 'FP_USERNAME=.*', "FP_USERNAME=$FP_USERNAME" `
		   -replace 'FP_PASSWORD=.*', "FP_PASSWORD=$FP_PASSWORD" `
		   -replace 'FRISTA_USERNAME=.*', "FRISTA_USERNAME=$FRISTA_USERNAME" `
		   -replace 'FRISTA_PASSWORD=.*', "FRISTA_PASSWORD=$FRISTA_PASSWORD"
	}
	$envContent = $envContent | Where-Object { $_ -notmatch '^TELEGRAM_' -and $_ -notmatch '^MACHINE_NAME=' }
	if ($TELEGRAM_BOT_TOKEN -and $TELEGRAM_CHAT_ID -and $MACHINE_NAME) {
		$envContent += "MACHINE_NAME=$MACHINE_NAME"
		$envContent += "TELEGRAM_ENABLED=true"
		$envContent += "TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN"
		$envContent += "TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID"
		Log "Telegram diaktifkan untuk [$MACHINE_NAME]" Green
	} else {
		$envContent += "TELEGRAM_ENABLED=false"
		Log "Telegram dilewati (tidak dikonfigurasi)" Yellow
	}
	$envContent | Set-Content ".env"
	Log ".env dikonfigurasi (unattended)" Green
} else {
	Write-Host ""
	Log "===== Konfigurasi (.env) =====" Cyan
	$fpUser = Read-Host "FP_USERNAME [$FP_USERNAME]"
	if (-not $fpUser) { $fpUser = $FP_USERNAME }
	$fpPass = Read-Host "FP_PASSWORD [$FP_PASSWORD]"
	if (-not $fpPass) { $fpPass = $FP_PASSWORD }
	$frUser = Read-Host "FRISTA_USERNAME [$FRISTA_USERNAME]"
	if (-not $frUser) { $frUser = $FRISTA_USERNAME }
	$frPass = Read-Host "FRISTA_PASSWORD [$FRISTA_PASSWORD]"
	if (-not $frPass) { $frPass = $FRISTA_PASSWORD }

	(Get-Content ".env") -replace 'FP_USERNAME=.*', "FP_USERNAME=$fpUser" |
		ForEach-Object { $_ -replace 'FP_PASSWORD=.*', "FP_PASSWORD=$fpPass" } |
		ForEach-Object { $_ -replace 'FRISTA_USERNAME=.*', "FRISTA_USERNAME=$frUser" } |
		ForEach-Object { $_ -replace 'FRISTA_PASSWORD=.*', "FRISTA_PASSWORD=$frPass" } |
		Set-Content ".env"

	Write-Host ""
	Log "===== Telegram (opsional) =====" Cyan
	$tg = Read-Host "Aktifkan notifikasi Telegram? (y/N)"
	if ($tg -eq 'y' -or $tg -eq 'Y') {
		$token = Read-Host "TELEGRAM_BOT_TOKEN (dari @BotFather)"
		$chat  = Read-Host "TELEGRAM_CHAT_ID"
		$name  = Read-Host "MACHINE_NAME (contoh: APM-LOKET-01)"
		$envLines = Get-Content ".env"
		$envLines = $envLines | Where-Object { $_ -notmatch '^TELEGRAM_' -and $_ -notmatch '^MACHINE_NAME=' }
		$envLines += "MACHINE_NAME=$name", "TELEGRAM_ENABLED=true", "TELEGRAM_BOT_TOKEN=$token", "TELEGRAM_CHAT_ID=$chat"
		$envLines | Set-Content ".env"
		Log "Telegram OK" Green
	} else {
		Log "Telegram dilewati" Yellow
	}
}

# ── 5. PM2 ──
if (-not (Check-PM2)) {
	Log "Install PM2..." Yellow
	npm install pm2@latest -g 2>>$LogFile
	if ($LASTEXITCODE -ne 0) {
		Log "PM2 gagal install" Red
		exit 1
	}
	Refresh-Path
}
Log "PM2 $(pm2 -v) (OK)" Green

# Kill existing bot process on port 3684
$oldPid = netstat -ano | Select-String ":3684" | ForEach-Object { $_.ToString() -replace '.*\s+(\d+)$', '$1' }
if ($oldPid) {
	Log "Matikan proses di port 3684 (PID $oldPid)..." Yellow
	$oldPid | ForEach-Object { taskkill /F /PID $_ 2>$null; Start-Sleep -Milliseconds 500 }
}

# Start PM2
pm2 delete apm-jkn-bot 2>$null
pm2 start "$ProjectRoot\src\server.js" --name apm-jkn-bot --node-args="--env-file=.env" 2>>$LogFile
if ($LASTEXITCODE -ne 0) {
	Log "PM2 start gagal" Red
	exit 1
}
pm2 save --force
Log "PM2 process saved" Green

# ── 6. Auto-start on boot ──
$batPath = "$ProjectRoot\pm2-start.bat"
$npmPath = if (Test-Path "$env:APPDATA\npm\pm2.cmd") { "$env:APPDATA\npm" } else { "$env:ProgramFiles\nodejs" }
@"
@echo off
cd /d "%~dp0"
set PM2_HOME=%USERPROFILE%\.pm2
set PATH=%PATH%;$npmPath
:: Tunggu 10 detik biar Windows siap
timeout /t 10 /nobreak >nul
:: Coba resurrect — retry 3x jika gagal
for /l %%i in (1,1,3) do (
	pm2 resurrect >nul 2>&1
	if not errorlevel 1 goto :done
	timeout /t 5 /nobreak >nul
)
:done
exit
"@ | Set-Content -Path $batPath -Force -Encoding ASCII

$shortcutDir = [System.Environment]::GetFolderPath('Startup')
$shortcutPath = "$shortcutDir\apm-jkn-bot.lnk"
try {
	$shell = New-Object -ComObject WScript.Shell
	$shortcut = $shell.CreateShortcut($shortcutPath)
	$shortcut.TargetPath = "cmd.exe"
	$shortcut.Arguments = "/c `"`"$batPath`"`""
	$shortcut.WindowStyle = 7
	$shortcut.Description = "APM JKN Bot"
	$shortcut.Save()
	Log "Auto-start: $shortcutPath" Green
} catch {
	Log "Gagal buat shortcut startup: $_" Yellow
}

# ── 7. Verify ──
Start-Sleep 3
try {
	$res = Invoke-RestMethod -Uri http://127.0.0.1:3684/ -TimeoutSec 5
	Log "✓ BOT BERJALAN — http://127.0.0.1:3684 ($($res.version))" Green
} catch {
	Log "✗ Bot tidak merespon — cek: pm2 logs apm-jkn-bot" Red
}

Log "=== Install selesai ===" Cyan
if (-not $Unattended) {
	Read-Host "Enter untuk tutup"
}
