@echo off
title NeuSource Statutory CRM
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Please install the LTS version from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing for the first time, please wait...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo  Starting NeuSource Statutory CRM...
echo  Keep this window open while you use the portal.
echo  Other computers on the same office Wi-Fi can open:  http://THIS-COMPUTER-IP:3000
echo.
start "" http://localhost:3000
node server.js
pause
