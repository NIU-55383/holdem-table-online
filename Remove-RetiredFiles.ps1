param([string]$Target = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $Target).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'server.js') -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $root 'package.json') -PathType Leaf)) {
    throw 'Choose the game repository folder containing server.js and package.json.'
}
$files = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'retired-files.json') -Raw | ConvertFrom-Json
foreach ($file in $files) {
    $path = [IO.Path]::GetFullPath((Join-Path $root $file))
    if (-not $path.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'A retired file path is outside the repository.'
    }
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        Remove-Item -LiteralPath $path
        Write-Output ('Removed: ' + $file)
    }
}
Write-Output 'Cleanup complete. Shared files, .git, and local configuration were not removed.'
