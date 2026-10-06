#requires -Version 7.0
<#
.SYNOPSIS
    Applies the print_settings migration (0008_print_settings.sql)
    to a Neon DB branch. Prompts separately for the dev and prod
    connection strings, with a confirmation gate before each apply.

.DESCRIPTION
    The migration adds a single nullable column `print_settings jsonb`
    to the `resumes` table. drizzle-kit reads the connection string
    from $env:POSTGRES_URL and applies any migrations under
    lib/db/migrations that haven't been recorded in its ledger yet.

    Required at runtime:
      - pnpm installed (the script shells out to pnpm db:migrate)
      - Both branch connection strings on hand (Neon dashboard ->
        Connection Details -> Branch connection string). Use the
        *pooled* endpoint (`-pooler.` host) for serverless
        environments.

.NOTES
    The script never echoes the full connection string, only the
    host fragment (post-@, before .) so you can sanity-check which
    branch you're hitting without leaking the full URL.

    Run from the repo root, or pass the path explicitly.

.EXAMPLE
    PS> .\scripts\migrate-print-settings.ps1
    # Prompts for dev connection string, asks confirmation, applies.
    # Then prompts for prod connection string, asks confirmation, applies.

.EXAMPLE
    # CI / scripted use — pass the URLs as parameters and skip the
    # preview gate (still requires the manual confirm step by default).
    PS> .\scripts\migrate-print-settings.ps1 `
        -DevUrl  $env:NEON_DEV_URL `
        -ProdUrl $env:NEON_PROD_URL
#>

[CmdletBinding()]
param(
  [switch]$SkipDev,
  [switch]$SkipProd,
  [string]$DevUrl,
  [string]$ProdUrl
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ─── Helpers ──────────────────────────────────────────────────────────

function Write-Section([string]$title) {
  Write-Host ''
  Write-Host '============================================================' -ForegroundColor Cyan
  Write-Host "  $title" -ForegroundColor Cyan
  Write-Host '============================================================' -ForegroundColor Cyan
}

function Format-Host([string]$url) {
  # "  host: ep-shy-bird-123456.us-east-2.aws.neon.tech" — useful
  # sanity-check that doesn't echo the password.
  if ([string]::IsNullOrWhiteSpace($url)) {
    return '(none)'
  }
  $match = [regex]::Match($url, '@([^/]+)')
  if ($match.Success) {
    return $match.Groups[1].Value
  }
  return '(unparseable)'
}

function Read-ConnectionString([string]$label) {
  Write-Host ''
  Write-Host "Paste the ${label} branch connection string:" -ForegroundColor Yellow
  Write-Host "(Neon dashboard -> Connection Details -> Branch connection string)" -ForegroundColor DarkGray
  Write-Host ''
  $secure = Read-Host -AsSecureString -Prompt "  ${label} URL>"
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Confirm-Apply([string]$branch, [string]$url) {
  Write-Host ''
  Write-Host "About to apply pending migrations to:" -ForegroundColor Yellow
  Write-Host "  branch:  $branch" -ForegroundColor White
  Write-Host "  host:    $(Format-Host $url)" -ForegroundColor White
  Write-Host ''
  $answer = Read-Host "Type 'yes' to apply, anything else to skip"
  return ($answer -eq 'yes')
}

function Invoke-Migrate {
  # The repo's drizzle.config.ts is auto-discovered and pins the
  # migrations folder + dialect. Setting $env:POSTGRES_URL per call
  # lets us point at one branch at a time without touching the user's
  # shell env permanently.
  Write-Host ''
  Write-Host 'Running pnpm db:migrate…' -ForegroundColor Cyan
  & pnpm db:migrate
  if ($LASTEXITCODE -ne 0) {
    throw "drizzle-kit migrate failed with exit code $LASTEXITCODE"
  }
}

# ─── Main ────────────────────────────────────────────────────────────

Set-Location -Path (Join-Path $PSScriptRoot '..')

# Find the latest pending migration file. drizzle-kit picks
# random codenames on `pnpm db:generate` so we cannot hardcode the
# filename.
$latestMigration = Get-ChildItem -Path "lib/db/migrations" -Filter "*.sql" |
  Where-Object { $_.Name -match "^[0-9]+_" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $latestMigration) {
  throw "No pending migration files found in lib/db/migrations — run pnpm db:generate first."
}
$latestMigrationPath = $latestMigration.FullName
$latestMigrationName = $latestMigration.Name

Write-Section "print_settings migration ($latestMigrationName)"
Get-Content $latestMigrationPath | Write-Host -ForegroundColor Gray

# ─── Apply to dev ───────────────────────────────────────────────────

if (-not $SkipDev) {
  Write-Section 'Step 1 / 3 — DEV branch'

  if ([string]::IsNullOrWhiteSpace($DevUrl)) {
    $DevUrl = Read-ConnectionString 'dev'
  } else {
    Write-Host "Using dev URL from -DevUrl parameter." -ForegroundColor DarkGray
  }

  if (Confirm-Apply 'dev' $DevUrl) {
    $env:POSTGRES_URL = $DevUrl
    Invoke-Migrate
    Remove-Item Env:POSTGRES_URL -ErrorAction SilentlyContinue
  } else {
    Write-Host "Skipped dev." -ForegroundColor DarkYellow
  }
}

# ─── Apply to prod ──────────────────────────────────────────────────

if (-not $SkipProd) {
  Write-Section 'Step 2 / 3 — PROD branch'

  if ([string]::IsNullOrWhiteSpace($ProdUrl)) {
    $ProdUrl = Read-ConnectionString 'prod'
  } else {
    Write-Host "Using prod URL from -ProdUrl parameter." -ForegroundColor DarkGray
  }

  if (Confirm-Apply 'prod' $ProdUrl) {
    $env:POSTGRES_URL = $ProdUrl
    Invoke-Migrate
    Remove-Item Env:POSTGRES_URL -ErrorAction SilentlyContinue
  } else {
    Write-Host "Skipped prod." -ForegroundColor DarkYellow
  }
}

# ─── Cleanup ────────────────────────────────────────────────────────

Write-Section 'Step 3 / 3 — Cleanup'
Remove-Item Env:POSTGRES_URL -ErrorAction SilentlyContinue
Write-Host "Cleared POSTGRES_URL from the current shell." -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Done. Branches where you typed `yes` should now have the' -ForegroundColor Green
Write-Host 'print_settings jsonb column on resumes. Run `pnpm dev` and' -ForegroundColor Green
Write-Host 'open a resume -> Page settings to verify the feature end-to-end.' -ForegroundColor Green
Write-Host ''