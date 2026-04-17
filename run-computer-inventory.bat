@echo off
setlocal

cd /d "%~dp0"
title Computer Inventory Launcher

echo ==========================================
echo   Computer Inventory - Auto Runner
echo ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js tidak ditemukan di PATH.
    echo Install Node.js terlebih dahulu, lalu jalankan lagi script ini.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm tidak ditemukan di PATH.
    echo Pastikan instalasi Node.js sudah lengkap, lalu jalankan lagi script ini.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Root dependencies belum ada. Menjalankan npm install...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Gagal menginstall dependency root.
        pause
        exit /b 1
    )
    echo.
)

if not exist "backend\node_modules" (
    echo [INFO] Backend dependencies belum ada. Menjalankan npm install di folder backend...
    call npm --prefix backend install
    if errorlevel 1 (
        echo.
        echo [ERROR] Gagal menginstall dependency backend.
        pause
        exit /b 1
    )
    echo.
)

if not exist "backend\.env" (
    if exist "backend\.env.example" (
        echo [WARNING] File backend\.env belum ada.
        echo Copy backend\.env.example menjadi backend\.env dan sesuaikan konfigurasi database bila diperlukan.
        echo.
    )
)

echo [INFO] Menjalankan backend dan frontend...
echo [INFO] Frontend : http://localhost:88/auth-login.html
echo [INFO] Backend  : http://localhost:3001/api
echo [INFO] Tekan Ctrl+C untuk menghentikan service.
echo.

start "" "http://localhost:88/auth-login.html"
call npm run dev:lan

set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo [INFO] Runner selesai dengan exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
