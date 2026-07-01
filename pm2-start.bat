@echo off
cd /d "%~dp0"
set PM2_HOME=%USERPROFILE%\.pm2

:: Cari pm2.cmd di PATH atau lokasi default
set NPM_DIR=%APPDATA%\npm
set PM2_CMD=%NPM_DIR%\pm2.cmd
if not exist "%PM2_CMD%" set PM2_CMD=pm2

:: Tunggu 10 detik biarin Windows siap
timeout /t 10 /nobreak >nul

:: Coba resurrect — retry 3x kalo gagal
for /l %%i in (1,1,3) do (
	"%PM2_CMD%" resurrect >nul 2>&1
	if not errorlevel 1 goto done
	timeout /t 5 /nobreak >nul
)
:done
exit
