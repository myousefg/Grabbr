@echo off
setlocal
cd /d "%~dp0.."

:: ============================================================
::  Fetch the gallery-dl engine into bin\gallery-dl.exe
::
::  Uses the gdl-org 64-bit Windows build. The gallery-dl
::  project's own release only ships a 32-bit exe that needs
::  the VC++ x86 redistributable; the gdl-org build is 64-bit
::  and self-contained.
::
::  To build from a local source tree instead:
::    set GDL_SRC=C:\path\to\gallery-dl-source
::    scripts\fetch-gdl.bat build
:: ============================================================

set DEST=bin\gallery-dl.exe
if not exist "bin" mkdir bin

if /I "%~1"=="build" goto :build

set GDL_URL=https://github.com/gdl-org/builds/releases/latest/download/gallery-dl_windows.exe
echo Downloading gallery-dl (gdl-org 64-bit build)...
echo   %GDL_URL%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-WebRequest -Uri '%GDL_URL%' -OutFile '%DEST%' -UseBasicParsing; Write-Host 'Saved to %DEST%' } catch { Write-Host 'FAILED:' $_.Exception.Message; exit 1 }"

if %errorlevel% neq 0 (
    echo.
    echo Download failed. Grab it by hand from:
    echo   https://github.com/gdl-org/builds/releases
    echo or build from source with:  scripts\fetch-gdl.bat build
    exit /b 1
)
goto :done

:build
if "%GDL_SRC%"=="" (
    echo ERROR: set GDL_SRC to the gallery-dl source folder first.
    exit /b 1
)
if not exist "%GDL_SRC%\scripts\pyinstaller.py" (
    echo ERROR: %GDL_SRC%\scripts\pyinstaller.py not found.
    exit /b 1
)
echo Building gallery-dl from %GDL_SRC% ...
python -m pip install -r "%GDL_SRC%\requirements.txt" pyinstaller -q --disable-pip-version-check
pushd "%GDL_SRC%\scripts"
python pyinstaller.py
popd
if not exist "%GDL_SRC%\dist\gallery-dl.exe" ( echo ERROR: build produced no exe & exit /b 1 )
copy /y "%GDL_SRC%\dist\gallery-dl.exe" "%DEST%" >nul
echo Copied build to %DEST%

:done
echo.
"%DEST%" --version
echo Done.
