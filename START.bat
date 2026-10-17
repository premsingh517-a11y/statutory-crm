@echo off
title NeuSource Statutory CRM - KEEP THIS WINDOW OPEN
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Please install the LTS version from https://nodejs.org , restart the computer, and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules\express (
  echo Installing for the first time, please wait 1-2 minutes...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Install failed. Check your internet connection and run START.bat again.
    pause
    exit /b 1
  )
)

echo.
echo  ==========================================================
echo    NeuSource Statutory CRM
echo    Open in browser:  http://localhost:3000
echo    KEEP THIS WINDOW OPEN while using the portal.
echo    (Minimise it - do not close it.)
echo  ==========================================================
echo.
start "" http://localhost:3000

:run
node server.js
echo.
echo  The portal stopped. Restarting in 5 seconds...  (close this window to stop it for good)
echo  If this keeps repeating, send a screenshot of this window, or the file data\error.log
timeout /t 5 /nobreak >nul
goto run
