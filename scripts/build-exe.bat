@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  Grabbr - Windows Build Script
::  Produces: dist\Grabbr-Setup-<VERSION>.exe + checksum.txt
::
::  Keep APP_VERSION in sync with:
::   1. "version" in package.json  (electron-builder names the installer from it)
::   2. filevers/prodvers in backend\version_info.txt
::
::  Non-interactive:  set GRABBR_NOPROMPT=1  (skips the pauses)
:: ============================================================

set APP_VERSION=1.1.1
set PY=python
where %PY% >nul 2>nul || set PY=py

pushd "%~dp0.."
set PROJECT_DIR=%CD%
popd
set INSTALLER_NAME=Grabbr-Setup-%APP_VERSION%.exe
set DIST_DIR=%PROJECT_DIR%\dist
set INSTALLER_PATH=%DIST_DIR%\%INSTALLER_NAME%
set CHECKSUM_PATH=%DIST_DIR%\checksum.txt
set PS_TEMP=%TEMP%\grabbr_checksum_%RANDOM%.ps1

echo.
echo =============================================
echo   Grabbr Build  v%APP_VERSION%
echo =============================================
echo.

:: -- Step 0: gallery-dl engine --------------------------------
if not exist "%PROJECT_DIR%\bin\gallery-dl.exe" (
    echo [0/4] Fetching gallery-dl.exe...
    call "%PROJECT_DIR%\scripts\fetch-gdl.bat"
    if errorlevel 1 ( echo ERROR: could not obtain bin\gallery-dl.exe & call :die )
) else (
    echo [0/4] bin\gallery-dl.exe present - skipping fetch.
)
echo.

:: -- Step 1: Python backend ---------------------------------
echo [1/4] Building Python backend with PyInstaller...
cd /d "%PROJECT_DIR%\backend"
%PY% -m pip install -r requirements.txt --quiet --disable-pip-version-check
%PY% -m PyInstaller grabbr_backend.spec --clean --noconfirm
if errorlevel 1 ( echo ERROR: PyInstaller failed. & call :die )
echo       Done. Output: backend\dist\grabbr-backend.exe
echo.

:: -- Step 2: React frontend --------------------------------
echo [2/4] Building React frontend...
cd /d "%PROJECT_DIR%\frontend"
call yarn install --frozen-lockfile
call yarn build
if errorlevel 1 ( echo ERROR: React build failed. & call :die )
echo       Done. Output: frontend\build\
echo.

:: -- Step 3: electron-builder ------------------------------
echo [3/4] Packaging installer with electron-builder...
cd /d "%PROJECT_DIR%"
call npm install --silent
call npm run dist
if errorlevel 1 ( echo ERROR: electron-builder failed. & call :die )
echo       Done. Output: dist\%INSTALLER_NAME%
echo.

:: -- Step 4: SHA-256 checksum ------------------------------
echo [4/4] Generating SHA-256 checksum...
if not exist "%INSTALLER_PATH%" ( echo WARNING: installer not found - skipping checksum. & goto :done )

echo $src = "%INSTALLER_PATH%"                                       > "%PS_TEMP%"
echo $out = "%CHECKSUM_PATH%"                                       >> "%PS_TEMP%"
echo $h   = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash >> "%PS_TEMP%"
echo [System.IO.File]::WriteAllText($out, "SHA256: " + $h + "  %INSTALLER_NAME%") >> "%PS_TEMP%"
echo Write-Host ("       SHA-256: " + $h)                           >> "%PS_TEMP%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_TEMP%"
del "%PS_TEMP%"

:done
echo.
echo =============================================
echo   Build complete!
echo   Installer : dist\%INSTALLER_NAME%
echo =============================================
echo.
if not defined GRABBR_NOPROMPT pause
exit /b 0

:die
if not defined GRABBR_NOPROMPT pause
exit /b 1
