@echo off
cd /d "%~dp0.."

:: A build in progress has these exact folders open for writing; deleting out
:: from under it is how dist\ has gone missing mid-build before. Only warns
:: (rather than refusing outright) since a lock left over from a build that
:: was killed instead of finishing would otherwise block clean.bat forever.
if exist ".building" (
    echo WARNING: a build looks like it's in progress ^(.building lock present^).
    echo          Run this again once it's finished, or delete .building by hand
    echo          if you know it's actually stale.
    echo.
    if not defined GRABBR_NOPROMPT (
        choice /C YN /M "Clean anyway"
        if errorlevel 2 exit /b 1
    )
    echo.
)

echo Cleaning generated folders...
echo.

if exist "node_modules"          ( rd /s /q "node_modules"          && echo   [x] node_modules )
if exist "frontend\node_modules" ( rd /s /q "frontend\node_modules" && echo   [x] frontend\node_modules )
if exist "frontend\build"        ( rd /s /q "frontend\build"        && echo   [x] frontend\build )
if exist "backend\dist"          ( rd /s /q "backend\dist"          && echo   [x] backend\dist )
if exist "backend\build"         ( rd /s /q "backend\build"         && echo   [x] backend\build )
if exist "dist"                  ( rd /s /q "dist"                  && echo   [x] dist )

for %%D in (node_modules frontend\node_modules frontend\build backend\dist backend\build dist) do (
    if exist "%%D" echo   [!] %%D could not be fully removed - something in it is still open
)

echo.
echo Cleaning app data (%APPDATA%\Grabbr: database, cache, cookies, thumbnails,
echo tools, logs)...
echo.

if exist "%APPDATA%\Grabbr" (
    rd /s /q "%APPDATA%\Grabbr" && echo   [x] %APPDATA%\Grabbr
    if exist "%APPDATA%\Grabbr" echo   [!] %APPDATA%\Grabbr could not be fully removed - Grabbr may still be running
) else (
    echo   (nothing at %APPDATA%\Grabbr)
)

echo.
echo Done. (bin\gallery-dl.exe is kept - delete it by hand if you want a fresh fetch.)
