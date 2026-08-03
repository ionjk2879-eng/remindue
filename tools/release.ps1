param([switch]$SkipPush)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $repoRoot 'release-state'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

function Run-Step([string]$Name, [string]$Directory, [scriptblock]$Command) {
  Write-Host "`n== $Name ==" -ForegroundColor Cyan
  Push-Location $Directory
  try {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}

if ((git -C $repoRoot branch --show-current) -ne 'main') { throw 'Release must run from main.' }
if (git -C $repoRoot status --porcelain --untracked-files=no) { throw 'Commit tracked changes before release.' }
if (-not $env:REMINDUE_SMOKE_EMAIL -or -not $env:REMINDUE_SMOKE_PASSWORD) {
  throw 'Set REMINDUE_SMOKE_EMAIL and REMINDUE_SMOKE_PASSWORD before release.'
}

Run-Step 'Frontend tests' "$repoRoot\frontend" { npm test }
Run-Step 'Frontend production build' "$repoRoot\frontend" { npm run build }
Run-Step 'Worker tests' "$repoRoot\workers" { npm test }
Run-Step 'Worker typecheck' "$repoRoot\workers" { npm run typecheck }
Run-Step 'Record production versions' "$repoRoot\workers" {
  npx wrangler deployments list --json | Set-Content -Encoding utf8 "$stateDir\worker-before.json"
  npx wrangler deployments list --json --name remindue-frontend | Set-Content -Encoding utf8 "$stateDir\frontend-before.json"
}
Run-Step 'Dev migrations' "$repoRoot\workers" { npm run db:migrate:dev }
Run-Step 'Dev Worker deploy' "$repoRoot\workers" { npm run deploy:dev }
Run-Step 'Dev frontend deploy' "$repoRoot\frontend" { npm run deploy:dev }
Run-Step 'Authenticated dev smoke test' $repoRoot { node tools/smoke-test.mjs 'https://remindue-dev.ionjk2879.workers.dev/api' }
if (-not $SkipPush) { Run-Step 'Push main' $repoRoot { git push origin main } }
Run-Step 'Production migrations' "$repoRoot\workers" { npm run db:migrate:remote }
Run-Step 'Production Worker deploy' "$repoRoot\workers" { npm run deploy }
Run-Step 'Production frontend deploy' "$repoRoot\frontend" { npm run deploy }
Run-Step 'Authenticated production smoke test' $repoRoot { node tools/smoke-test.mjs 'https://remindue.ionjk2879.workers.dev/api' }
Write-Host "`nRelease complete. Rollback metadata: $stateDir" -ForegroundColor Green
