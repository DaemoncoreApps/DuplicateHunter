$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = Split-Path -Parent $PSScriptRoot
$projectMetadata = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$packagePath = Join-Path $projectRoot ("release/DaemonCore-Duplicate-Hunter-{0}-x64.appx" -f $projectMetadata.version)
$archive = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
try {
    $entry = $archive.GetEntry('AppxManifest.xml')
    if ($null -eq $entry) { throw 'AppX manifest is missing.' }
    $reader = [System.IO.StreamReader]::new($entry.Open())
    try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($manifest.Package.Identity.Name -ne $projectMetadata.build.appx.identityName) { throw 'Package identity mismatch.' }
    if ($manifest.Package.Identity.Publisher -ne $projectMetadata.build.appx.publisher) { throw 'Publisher mismatch.' }
    if ($manifest.Package.Properties.DisplayName -ne $projectMetadata.build.appx.displayName) { throw 'Display name mismatch.' }
    if ($manifest.Package.Identity.ProcessorArchitecture -ne 'x64') { throw 'Unexpected architecture.' }
    if ($manifest.Package.Dependencies.TargetDeviceFamily.MinVersion -ne $projectMetadata.build.appx.minVersion) { throw 'Minimum Windows version mismatch.' }
    foreach ($assetName in @('StoreLogo', 'Square44x44Logo', 'Square150x150Logo', 'Wide310x150Logo')) {
        if ($null -eq $archive.GetEntry("assets/$assetName.png") -and $null -eq $archive.GetEntry("assets\$assetName.png")) { throw "Missing branded asset: $assetName" }
    }
    Write-Output "Verified AppX identity, publisher, display name, architecture, minimum Windows version, and branded assets: $packagePath"
} finally { $archive.Dispose() }
