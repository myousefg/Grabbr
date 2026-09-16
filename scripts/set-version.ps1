# Syncs the app version across every file that hardcodes it. Called from
# build-exe.bat when you give it a new version to build; safe to run by hand
# too: .\scripts\set-version.ps1 -OldVersion 1.1.1 -NewVersion 1.1.2
param(
    [Parameter(Mandatory)][string]$OldVersion,
    [Parameter(Mandatory)][string]$NewVersion
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if ($OldVersion -eq $NewVersion) { exit 0 }
if ($NewVersion -notmatch '^\d+\.\d+\.\d+$') { throw "Version must be X.Y.Z, got '$NewVersion'" }
$parts = $NewVersion.Split('.')
$tuple = "$($parts[0]), $($parts[1]), $($parts[2]), 0"

function Update-File($path, $pattern, $replacement) {
    $content = Get-Content -Raw -LiteralPath $path
    $updated = [regex]::Replace($content, $pattern, $replacement)
    if ($updated -eq $content) {
        Write-Warning "No match in $path for pattern: $pattern"
    }
    Set-Content -LiteralPath $path -Value $updated -NoNewline
    Write-Host "  [x] $($path.Substring($root.Length).TrimStart('\'))"
}

Write-Host "Syncing version $OldVersion -> $NewVersion ..."

Update-File (Join-Path $root 'package.json') `
    '("version":\s*")[\d.]+(")' ('${1}' + $NewVersion + '${2}')

Update-File (Join-Path $root 'backend\server.py') `
    '(APP_VERSION = ")[\d.]+(")' ('${1}' + $NewVersion + '${2}')

$viPath = Join-Path $root 'backend\version_info.txt'
$vi = Get-Content -Raw -LiteralPath $viPath
$vi = [regex]::Replace($vi, '(filevers=\()[\d,\s]+(\))', '${1}' + $tuple + '${2}')
$vi = [regex]::Replace($vi, '(prodvers=\()[\d,\s]+(\))', '${1}' + $tuple + '${2}')
$vi = [regex]::Replace($vi, "(FileVersion',\s*u')[\d.]+(')", '${1}' + $NewVersion + '.0${2}')
$vi = [regex]::Replace($vi, "(ProductVersion',\s*u')[\d.]+(')", '${1}' + $NewVersion + '${2}')
Set-Content -LiteralPath $viPath -Value $vi -NoNewline
Write-Host "  [x] backend\version_info.txt"

$readmePath = Join-Path $root 'README.md'
$readme = (Get-Content -Raw -LiteralPath $readmePath).Replace($OldVersion, $NewVersion)
Set-Content -LiteralPath $readmePath -Value $readme -NoNewline
Write-Host "  [x] README.md"

# The browser extension ships out of band (zip attached to a GitHub release,
# not the installer), but keeping its version number equal to the app's
# avoids the two silently drifting apart with no way to tell which app
# version an extension build goes with.
Update-File (Join-Path $root 'extension\manifest.json') `
    '("version":\s*")[\d.]+(")' ('${1}' + $NewVersion + '${2}')

# build-exe.bat reads its version straight from package.json (updated above)
# rather than keeping its own copy, so nothing else to sync here.
