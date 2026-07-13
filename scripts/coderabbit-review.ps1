<#
.SYNOPSIS
    Run a CodeRabbit code review against the latest commit.

.DESCRIPTION
    CodeRabbit is installed inside WSL (the official CLI is
    Linux/macOS only; the Windows-port attempt under .git/hooks
    was abandoned because msys2 bash + wsl + PowerShell detach is
    too fragile for an automatic hook on Windows). This script
    is the simpler, version-controlled entry point: PowerShell
    invokes WSL, which invokes the official coderabbit binary.

    Output streams back to the calling shell as it arrives, so
    `pnpm review` (or a direct call) reads the same as `cr`
    would on a Mac.

.PARAMETER Base
    The git ref to compare HEAD against. Defaults to HEAD~1 —
    i.e. "review only what the last commit changed". Set to
    `main` to review everything since the main branch (slow,
    ~7-30 min for a multi-commit window).

.PARAMETER Mode
    `light` (default) runs the faster local review policy
    (sub-5-minute target; drops some context-aware analysis but
    still catches critical issues).
    `full` is the default CodeRabbit review (~7-30 minutes).

.PARAMETER Plain
    Emit human-readable text instead of agent-optimised JSON.
    Default is true. Set `-Plain:$false` to capture structured
    findings for downstream tooling.

.PARAMETER CrBinPath
    Override the path inside WSL to the `coderabbit` binary.
    Defaults to the installer's standard location
    (`~/.local/bin/coderabbit`); set this if you installed
    somewhere else (e.g. via a package manager).

.EXAMPLE
    scripts/coderabbit-review.ps1

    Reviews the last commit (HEAD~1 -> HEAD) in light mode,
    plain text output. Blocking — wait for ~3-5 min.

.EXAMPLE
    scripts/coderabbit-review.ps1 -Base main

    Reviews all unmerged commits since main, in light mode.
    Blocking — could take 10+ minutes for a multi-commit window.

.EXAMPLE
    scripts/coderabbit-review.ps1 -Base HEAD~1 -Plain:$false

    Reviews the last commit and emits structured JSON to stdout
    for a coding agent (Mavis, Claude Code, etc) to parse.

.EXAMPLE
    scripts/coderabbit-review.ps1 -CrBinPath '/home/me/.local/bin/coderabbit'

    Override the binary location when running under a different
    WSL user.
#>

[CmdletBinding()]
param(
    [string] $Base = 'HEAD~1',
    [ValidateSet('light', 'full')] [string] $Mode = 'light',
    [bool] $Plain = $true,
    [string] $CrBinPath = ''
)

$ErrorActionPreference = 'Stop'

# Resolve the CodeRabbit binary inside WSL. Default location is
# the installer's standard (~/.local/bin/coderabbit for the
# official Linux install); we resolve dynamically via `command
# -v` so the script is portable across WSL users and install
# methods (apt, brew-on-Linux, direct download). An explicit
# `-CrBinPath` wins. If `command -v coderabbit` returns empty
# and no override was given, fail with an actionable message
# instead of letting `wsl` surface a confusing exec failure
# five minutes into the review.
if ($CrBinPath) {
    $crBin = $CrBinPath
} else {
    $discovered = (& wsl.exe bash -lc 'command -v coderabbit').Trim()
    if (-not $discovered) {
        throw "Could not locate 'coderabbit' inside WSL. Pass -CrBinPath or install the CLI on the WSL side."
    }
    $crBin = $discovered
}

# Check WSL is reachable before we spend 5 minutes on a review
# that was always going to fail.
& wsl.exe --status *> $null
if ($LASTEXITCODE -ne 0) {
    throw "wsl --status failed (exit $LASTEXITCODE). Is WSL installed and a default distro configured?"
}

# Build the CodeRabbit argument vector. -Plain is `cr review`
# default behaviour for human consumers; we expose a switch for
# the agent flow.
$crArgs = @('review')

if ($Mode -eq 'light') {
    $crArgs += '--light'
}

if ($Plain) {
    $crArgs += '--plain'
}

$crArgs += @('--base', $Base)

# PowerShell's CWD == git's root because the script is invoked
# from the repo, but resolve just in case the user runs it from
# elsewhere. wsl.exe accepts a Windows-style path on its `--cd`
# flag natively (no wslpath round-trip needed).
$repoWindows = (Get-Location).Path

Write-Host "CodeRabbit review: base=$Base mode=$Mode plain=$Plain" -ForegroundColor Cyan
Write-Host "Repo:             $repoWindows" -ForegroundColor DarkGray
Write-Host "Binary (WSL):     $crBin" -ForegroundColor DarkGray
Write-Host "Calling:          wsl --cd `"$repoWindows`" $crBin $($crArgs -join ' ')" -ForegroundColor DarkGray
Write-Host ''

# Synchronous invocation. Output streams as it arrives. We let
# wsl inherit CWD via --cd so CodeRabbit can find
# .git/.coderabbit.yaml/AGENTS.md without a flag-fest.
# Capture stderr separately so we can surface rate-limit / auth
# warnings distinctly from the review body, but let stdout
# stream through to the host — that's where the actual review
# lives. (Previous version captured stdout to a temp file and
# silently dropped it; round-3 reviews were "truncated" because
# the review body never made it past the launcher. This is the
# fix.)
$stderrLog = New-TemporaryFile
try {
    & wsl.exe --cd "$repoWindows" "$crBin" @crArgs 2> $stderrLog
    $exit = $LASTEXITCODE
} finally {
    # Surface stderr if it's non-empty (CR sometimes warns to
    # stderr about rate limits / auth that we want to keep in
    # the user's view, NOT silently drop).
    if ((Get-Content $stderrLog -Raw).Trim().Length -gt 0) {
        Write-Host '--- stderr ---' -ForegroundColor Yellow
        Get-Content $stderrLog | Write-Host -ForegroundColor Yellow
        Write-Host '--- end stderr ---' -ForegroundColor Yellow
    }
    Remove-Item $stderrLog -Force -ErrorAction SilentlyContinue
}

Write-Host ''
if ($exit -eq 0) {
    Write-Host 'CodeRabbit review complete.' -ForegroundColor Green
} else {
    Write-Host "CodeRabbit review exited with code $exit." -ForegroundColor Yellow
}

exit $exit

