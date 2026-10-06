#requires -Version 7.0
<#
.SYNOPSIS
    Verifies the print_settings column on the resumes table.

.DESCRIPTION
    Reads the connection string from -Url (or prompts for one) and
    introspects information_schema.columns. Surfaces three things:
      1. Whether the column exists
      2. Its type (jsonb) and nullability
      3. How many migrations drizzle-kit has recorded as applied
         (helps distinguish "column never created" vs "column there
         but the ledger is out of sync")

.NOTES
    Doesn't print the URL. Just the host fragment and the schema
    facts.
#>

[CmdletBinding()]
param([string]$Url)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Url)) {
  Write-Host ''
  Write-Host 'Paste the branch connection string to inspect:' -ForegroundColor Yellow
  $secure = Read-Host -AsSecureString -Prompt '  URL>'
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $Url = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$env:POSTGRES_URL = $Url

# Show host only — never echo the password.
$match = [regex]::Match($Url, '@([^/]+)')
Write-Host ''
Write-Host "Inspecting host: $($match.Groups[1].Value)" -ForegroundColor Cyan
Write-Host ''

# Column check.
Write-Host '--- information_schema.columns ---' -ForegroundColor Cyan
& pnpm exec -- node -e "import('postgres').then(async ({default:postgres}) => { const sql = postgres(process.env.POSTGRES_URL, {ssl:'require'}); const rows = await sql\`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'resumes' AND column_name = 'print_settings';\`; console.log(JSON.stringify(rows, null, 2)); await sql.end({timeout: 5}); });"
if ($LASTEXITCODE -ne 0) { Write-Host '  (column query failed — likely connection error)' -ForegroundColor Yellow; return }

# Migration ledger check.
Write-Host ''
Write-Host '--- drizzle migration ledger ---' -ForegroundColor Cyan
& pnpm exec -- node -e "import('postgres').then(async ({default:postgres}) => { const sql = postgres(process.env.POSTGRES_URL, {ssl:'require'}); const rows = await sql\`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;\`; console.log(JSON.stringify(rows, null, 2)); await sql.end({timeout: 5}); });"
if ($LASTEXITCODE -ne 0) { Write-Host '  (ledger query failed — schema "drizzle" may not exist yet)' -ForegroundColor Yellow }

Remove-Item Env:POSTGRES_URL -ErrorAction SilentlyContinue