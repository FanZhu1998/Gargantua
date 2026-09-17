param(
  [Parameter(Mandatory = $true)]
  [string]$SetupPath
)

$ErrorActionPreference = 'Stop'
$identity = node -e "const { APP_IDENTITY } = require('./src/electron/app-identity.cjs'); process.stdout.write(JSON.stringify(APP_IDENTITY));" | ConvertFrom-Json
$package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
$resolvedSetup = (Resolve-Path -LiteralPath $SetupPath).Path
$installRoot = Join-Path $env:LOCALAPPDATA $identity.squirrelName
$updateExe = Join-Path $installRoot 'Update.exe'
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$($identity.squirrelName)"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) "$($identity.productName).lnk"
$startMenuShortcut = Join-Path ([Environment]::GetFolderPath('StartMenu')) "Programs\$($identity.companyName)\$($identity.productName).lnk"

function Wait-Until {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Condition,
    [Parameter(Mandatory = $true)]
    [string]$FailureMessage
  )
  foreach ($attempt in 1..30) {
    if (& $Condition) { return }
    Start-Sleep -Seconds 1
  }
  throw $FailureMessage
}

if ((Test-Path -LiteralPath $installRoot) -or (Test-Path -LiteralPath $uninstallKey)) {
  throw "The installer smoke test requires a clean user profile for $($identity.productName)."
}

try {
  $install = Start-Process -FilePath $resolvedSetup -ArgumentList '--silent' -WindowStyle Hidden -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw "Installer exited with code $($install.ExitCode)." }

  Wait-Until { Test-Path -LiteralPath $uninstallKey } 'The Installed apps registry entry was not created.'
  Wait-Until { (Test-Path -LiteralPath $desktopShortcut) -and (Test-Path -LiteralPath $startMenuShortcut) } 'Desktop and Start menu shortcuts were not created.'

  $entry = Get-ItemProperty -LiteralPath $uninstallKey
  if ($entry.DisplayName -ne $identity.productName) { throw "Unexpected DisplayName: $($entry.DisplayName)" }
  if ($entry.DisplayVersion -ne $package.version) { throw "Unexpected DisplayVersion: $($entry.DisplayVersion)" }
  if ($entry.Publisher -ne $identity.companyName) { throw "Unexpected Publisher: $($entry.Publisher)" }
  if ($entry.InstallLocation -ne $installRoot) { throw "Unexpected InstallLocation: $($entry.InstallLocation)" }
  if ($entry.UninstallString -ne "`"$updateExe`" --uninstall") { throw "Unexpected UninstallString: $($entry.UninstallString)" }
  if (-not (Test-Path -LiteralPath (Join-Path $installRoot "$($identity.executableName).exe"))) { throw 'The execution stub is missing.' }
}
finally {
  if (Test-Path -LiteralPath $updateExe) {
    $uninstall = Start-Process -FilePath $updateExe -ArgumentList '--uninstall', '-s' -WindowStyle Hidden -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) { throw "Uninstaller exited with code $($uninstall.ExitCode)." }
  }
}

Wait-Until { -not (Test-Path -LiteralPath $uninstallKey) } 'The Installed apps registry entry remains after uninstall.'
Wait-Until { -not (Test-Path -LiteralPath $desktopShortcut) -and -not (Test-Path -LiteralPath $startMenuShortcut) } 'A shortcut remains after uninstall.'
Write-Host 'Windows installer smoke test passed.'
