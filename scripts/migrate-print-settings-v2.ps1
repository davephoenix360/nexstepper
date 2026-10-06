#requires -Version 7.0
<#
.SYNOPSIS
    Applies the print_settings migration (0008_print_settings.sql)
    to a Neon DB branch, with explicit pre-flight + post-verify
    so the script never reports "success" unless the column is
    actually queryable in the live DB.

.DESCRIPTION
    v2 changes vs v1:
      - Pre-flight: queries current_database() + checks whether
        print_settings already exists. Prints the host and DB name
        so you can sanity-check which branch you are actually
        pointed at.
      - Post-verify: after drizzle-kit returns, runs the column
        check again. If the column is missing, throws instead of
        returning success. No more "applied successfully" followed
        by a 500 on the dashboard.

    Same SecureString URL handling + manual confirm gate as v1.
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

function Write-Section([string]$title) {
  Write-Host ''
  Write-Host '============================================================' -ForegroundColor Cyan
  Write-Host "  $title" -ForegroundColor Cyan
  Write-Host '============================================================' -ForegroundColor Cyan
}

function Format-Host([string]$url) {
  $match = [regex]::Match($url, '@([^/]+)')
  if ($match.Success) { return $match.Groups[1].Value }
  return '(unparseable)'
}

function Format-DbName([string]$url) {
  $match = [regex]::Match($url, '/([^?]+)')
  if ($match.Success) { return $match.Groups[1].Value }
  return '(unparseable)'
}

function Read-ConnectionString([string]$label) {
  Write-Host ''
  Write-Host "Paste the $label branch connection string:" -ForegroundColor Yellow
  Write-Host "(Neon dashboard -> Connection Details -> Branch connection string)" -ForegroundColor DarkGray
  $secure = Read-Host -AsSecureString -Prompt "  $label URL>"
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Confirm-Apply([string]$branch, [string]$url) {
  Write-Host ''
  Write-Host 'About to apply pending migrations to:' -ForegroundColor Yellow
  Write-Host "  branch:  $branch" -ForegroundColor White
  Write-Host "  host:    $(Format-Host $url)" -ForegroundColor White
  Write-Host "  dbname:  $(Format-DbName $url)" -ForegroundColor White
  $answer = Read-Host "Type 'yes' to apply, anything else to skip"
  return ($answer -eq 'yes')
}

function Test-ColumnPresent([string]$url) {
  $env:POSTGRES_URL = $url
  $output = & pnpm exec -- node -e "import('postgres').then(async ({default:postgres}) => { const sql = postgres(process.env.POSTGRES_URL, {ssl:'require'}); const rows = await sql\`SELECT 1 AS exists FROM information_schema.columns WHERE table_name='resumes' AND column_name='print_settings';\`; process.stdout.write(rows.length > 0 ? 'YES' : 'NO'); await sql.end({timeout:5}); });"
  if ($LASTEXITCODE -ne 0) { throw "Column-check query failed for $url" }
  return ($output.Trim() -eq 'YES')
}

function Get-CurrentDbInfo([string]$url) {
  $env:POSTGRES_URL = $url
  $output = & pnpm exec -- node -e "import('postgres').then(async ({default:postgres}) => { const sql = postgres(process.env.POSTGRES_URL, {ssl:'require'}); const rows = await sql\`SELECT current_database() AS db, current_user AS user;\`; console.log(JSON.stringify(rows[0])); await sql.end({timeout:5}); });"
  if ($LASTEXITCODE -ne 0) { return '(connect failed)' }
  return $output.Trim()
}

function Invoke-Migrate {
  Write-Host ''
  Write-Host 'Running pnpm db:migrate…' -ForegroundColor Cyan
  & pnpm db:migrate
  if ($LASTEXITCODE -ne 0) {
    throw "drizzle-kit migrate failed with exit code $LASTEXITCODE"
  }
}

function Apply-To([string]$branch, [string]$url) {
  Write-Section "$branch branch"
  if ([string]::IsNullOrWhiteSpace($url)) {
    $url = Read-ConnectionString $branch
  } else {
    Write-Host "Using $branch URL from parameter." -ForegroundColor DarkGray
  }
  Write-Host ''
  Write-Host "Pre-flight: connecting to $(Format-Host $url)…" -ForegroundColor Cyan
  Write-Host "  current connection: $(Get-CurrentDbInfo $url)"
  $hadColumn = $false
  try {
    $hadColumn = Test-ColumnPresent $url
  } catch {
    Write-Host "  (pre-flight check failed: $_)" -ForegroundColor Yellow
  }
  if ($hadColumn) {
    Write-Host "  column print_settings EXISTS on this DB." -ForegroundColor Green
    $answer = Read-Host "Column already present. Skip this branch? (yes/no)"
    if ($answer -ne 'no') {
      Write-Host "Skipped $branch." -ForegroundColor DarkYellow
      return
    }
  } else {
    Write-Host "  column print_settings NOT present on this DB." -ForegroundColor Yellow
  }
  if (-not (Confirm-Apply $branch $url)) {
    Write-Host "Skipped $branch." -ForegroundColor DarkYellow
    return
  }
  $env:POSTGRES_URL = $url
  Invoke-Migrate
  Write-Host ''
  Write-Host "Post-verify: confirming column landed…" -ForegroundColor Cyan
  try {
    $verified = Test-ColumnPresent $url
    if ($verified) {
      Write-Host "  [OK] print_settings column is now queryable on this DB." -ForegroundColor Green
    } else {
      throw "post-verify failed: column still not present after drizzle-kit reported success"
    }
  } catch {
    Write-Host "  [FAIL] $_" -ForegroundColor Red
    throw
  } finally {
    Remove-Item Env:POSTGRES_URL -ErrorAction SilentlyContinue
  }
}

Set-Location -Path (Join-Path $PSScriptRoot '..')

if (-not (Test-Path 'lib/db/migrations/0008_print_settings.sql')) {
  throw "Migration not found — are you in the right repo?"
}

Write-Section 'print_settings migration (0008_print_settings.sql) — Oct 2026 (v2)'
Get-Content 'lib/db/migrations/0008_print_settings.sql' | Write-Host -ForegroundColor Gray

if (-not $SkipDev) { Apply-To 'dev' $DevUrl }
if (-not $SkipProd) { Apply-To 'prod' $ProdUrl }

Write-Section 'Done'
Write-Host "Done. Both branches (where you typed 'yes') should now have the" -ForegroundColor Green
Write-Host 'print_settings jsonb column on resumes. The dashboard should load cleanly.' -ForegroundColor Green
Write-Host ''
