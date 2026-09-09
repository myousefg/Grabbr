@echo off
cd /d "%~dp0.."

echo Cleaning generated folders...
echo.

if exist "node_modules"          ( rd /s /q "node_modules"          && echo   [x] node_modules )
if exist "frontend\node_modules" ( rd /s /q "frontend\node_modules" && echo   [x] frontend\node_modules )
if exist "frontend\build"        ( rd /s /q "frontend\build"        && echo   [x] frontend\build )
if exist "backend\dist"          ( rd /s /q "backend\dist"          && echo   [x] backend\dist )
if exist "backend\build"         ( rd /s /q "backend\build"         && echo   [x] backend\build )
if exist "dist"                  ( rd /s /q "dist"                  && echo   [x] dist )

echo.
echo Done. (bin\gallery-dl.exe is kept - delete it by hand if you want a fresh fetch.)
