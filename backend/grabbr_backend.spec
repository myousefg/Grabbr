# PyInstaller spec. Run: pyinstaller grabbr_backend.spec
from PyInstaller.utils.hooks import collect_submodules

a = Analysis(
    ['server.py'],
    pathex=['.'],
    binaries=[],
    datas=[],
    hiddenimports=(
        collect_submodules('uvicorn') +
        collect_submodules('fastapi') +
        ['uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
         'uvicorn.protocols', 'uvicorn.protocols.http',
         'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets',
         'uvicorn.protocols.websockets.auto', 'uvicorn.protocols.websockets.websockets_impl',
         'uvicorn.lifespan', 'uvicorn.lifespan.on', 'websockets', 'websockets.legacy']
    ),
    hookspath=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, a.binaries, a.zipfiles, a.datas,
    name='grabbr-backend',
    debug=False, bootloader_ignore_signals=False,
    strip=False, upx=True,
    console=False,
    onefile=True,
    version='version_info.txt',
)
