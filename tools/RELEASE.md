# Release automation

Set a dedicated non-production-capable smoke account in the current shell:

```powershell
$env:REMINDUE_SMOKE_EMAIL = 'smoke@example.com'
$env:REMINDUE_SMOKE_PASSWORD = '...'
```

Run `./tools/release.ps1` from a clean `main` branch. The script stops immediately on a failed
test, build, migration, deployment, or authenticated smoke check. Production is reached only
after the dev API passes checks for login, purchases, notification settings, domain policy, and
the FX recalculation endpoint.

The previous Worker and frontend deployment lists are saved under ignored `release-state/`.
To restore a recorded version:

```powershell
./tools/rollback.ps1 -Target worker -VersionId '<version-id>'
./tools/rollback.ps1 -Target frontend -VersionId '<version-id>'
```
