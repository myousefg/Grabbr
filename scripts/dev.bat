@echo off
setlocal
cd /d "%~dp0.."

echo =============================================
echo  Grabbr - Dev
echo =============================================
echo.

echo Killing any previous instance on port 8766...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8766 "') do (
    taskkill /f /pid %%a 2>nul
)
timeout /t 1 /nobreak >nul

if not exist "bin\gallery-dl.exe" (
    echo.
    echo   [!] bin\gallery-dl.exe not found.
    echo       Run scripts\fetch-gdl.bat  (downloads the official build)
    echo       or drop your own gallery-dl.exe into bin\.
    echo       Dev will still start and fall back to gallery-dl on PATH.
    echo.
)

echo [1/3] Installing root Node deps...
call npm install --loglevel=error --no-fund --no-audit
if %errorlevel% neq 0 ( echo ERROR: npm install failed & pause & exit /b 1 )

echo [2/3] Installing frontend deps...
cd frontend
call yarn install --silent 2>nul
cd ..

echo [3/3] Installing Python backend deps...
python -m pip install -r backend\requirements.txt -q --disable-pip-version-check 2>nul
if %errorlevel% neq 0 (
    py -m pip install -r backend\requirements.txt -q --disable-pip-version-check 2>nul
)

echo.
echo =============================================
echo  Starting Grabbr
echo  React   : http://localhost:3000
echo  Backend : http://localhost:8766
echo =============================================
echo.

set NODE_NO_WARNINGS=1
set NODE_OPTIONS=--no-deprecation
npm start --silent
