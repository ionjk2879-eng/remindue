param(
  [Parameter(Mandatory = $true)][ValidateSet('worker', 'frontend')][string]$Target,
  [Parameter(Mandatory = $true)][string]$VersionId,
  [switch]$Dev
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if ($Target -eq 'worker') {
  Push-Location "$repoRoot\workers"
  try {
    $deployArgs = @('wrangler', 'versions', 'deploy', $VersionId, '--yes')
    if ($Dev) { $deployArgs += @('--env', 'dev') }
    npx @deployArgs
  } finally { Pop-Location }
} else {
  Push-Location "$repoRoot\frontend"
  try { npx wrangler versions deploy $VersionId --yes } finally { Pop-Location }
}
if ($LASTEXITCODE -ne 0) { throw "Rollback failed with exit code $LASTEXITCODE" }
