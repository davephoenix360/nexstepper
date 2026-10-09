$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# ------------------------------------------------------------------
# Favicon + icon generation from the Nexstepper mark.
#
# The mark alone is dark navy and disappears in a dark browser tab bar,
# and it is not square. So render it centred on a white rounded square —
# visible in both light and dark tab themes.
#
# Emits TWO files on purpose:
#   app/icon.png    → Next.js links this as <link rel="icon" type="image/png">
#   app/favicon.ico → served at the bare /favicon.ico path
#
# Why both matter: a browser tab prefers whichever icon the document
# links, and bookmark managers / RSS readers / older browsers often fetch
# /favicon.ico with no document at all. Shipping only one leaves a hole.
#
# Why they MUST agree: if app/favicon.ico exists alongside app/icon.png,
# favicon.ico wins and takes precedence in the <link> tags. That is
# exactly how the saas-starter's stock Vercel favicon survived a rebrand
# that had already produced the right icon — it was correct in the repo
# and never rendered. See tests/unit/favicon.test.ts.
#
# NOTE: the .ico is assembled by hand into a byte list rather than via
# BinaryWriter — this PowerShell's BinaryWriter adapter does not surface
# WriteByte. PNG-compressed ICO entries are supported since Windows Vista
# and by every browser in current use.
# ------------------------------------------------------------------

function Add-Byte($list, [int]$v) {
    $list.Add([byte]($v -band 0xFF))
}
function Add-LE16($list, [int]$v) {
    $list.Add([byte]($v -band 0xFF))
    $list.Add([byte](($v -shr 8) -band 0xFF))
}
function Add-LE32($list, [int]$v) {
    $list.Add([byte]($v -band 0xFF))
    $list.Add([byte](($v -shr 8) -band 0xFF))
    $list.Add([byte](($v -shr 16) -band 0xFF))
    $list.Add([byte](($v -shr 24) -band 0xFF))
}

$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path 'public\brand\nexstepper-icon-clean.png'))
$markW = $src.Width; $markH = $src.Height

$canvas = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.SmoothingMode = 'HighQuality'
$g.InterpolationMode = 'HighQualityBicubic'
$g.PixelOffsetMode = 'HighQuality'
$g.Clear([System.Drawing.Color]::White)

# rounded-square plate
$plate = 44
$g.FillRectangle([System.Drawing.Brushes]::White, $plate, $plate, 512 - 2 * $plate, 512 - 2 * $plate)

$inner = 512 - 2 * 112
$scale = [Math]::Min($inner / $markW, $inner / $markH)
$dw = [int]($markW * $scale); $dh = [int]($markH * $scale)
$g.DrawImage($src, [int]((512 - $dw) / 2), [int]((512 - $dh) / 2), $dw, $dh)
$g.Dispose(); $src.Dispose()

New-Item -ItemType Directory -Force -Path 'app' | Out-Null

# --- app/icon.png -------------------------------------------------
$outPng = Join-Path (Get-Location) 'app\icon.png'
$canvas.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host ("icon.png      {0} KB" -f [math]::Round((Get-Item $outPng).Length/1KB, 1))

# --- app/favicon.ico ----------------------------------------------
# Downscale from the 512 master rather than re-laying-out per size, so
# every resolution is guaranteed to be the same artwork.
$sizes = @(16, 32, 48, 256)
$blobs = @()
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $gg = [System.Drawing.Graphics]::FromImage($bmp)
    $gg.SmoothingMode = 'HighQuality'
    $gg.InterpolationMode = 'HighQualityBicubic'
    $gg.PixelOffsetMode = 'HighQuality'
    $gg.CompositingQuality = 'HighQuality'
    $gg.Clear([System.Drawing.Color]::White)
    $gg.DrawImage($canvas, 0, 0, $s, $s)
    $gg.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $blobs += ,$ms.ToArray()
    $ms.Dispose()
}

$dir = New-Object 'System.Collections.Generic.List[byte]'

# ICONDIR
Add-LE16 $dir 0              # reserved
Add-LE16 $dir 1              # type: 1 = icon
Add-LE16 $dir $sizes.Count   # image count

$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    # 256 is encoded as 0 — the width/height fields are a single byte.
    $dim = if ($s -ge 256) { 0 } else { $s }
    Add-Byte $dir $dim          # width
    Add-Byte $dir $dim          # height
    Add-Byte $dir 0             # palette size (0 = truecolour)
    Add-Byte $dir 0             # reserved
    Add-LE16 $dir 1             # colour planes
    Add-LE16 $dir 32            # bits per pixel
    Add-LE32 $dir $blobs[$i].Length
    Add-LE32 $dir $offset
    $offset += $blobs[$i].Length
}

foreach ($blob in $blobs) {
    foreach ($b in $blob) { $dir.Add($b) }
}

$outIco = Join-Path (Get-Location) 'app\favicon.ico'
[System.IO.File]::WriteAllBytes($outIco, $dir.ToArray())
$canvas.Dispose()

Write-Host ("favicon.ico   {0} KB  ({1} sizes: {2})" -f `
    [math]::Round((Get-Item $outIco).Length/1KB, 1),
    $sizes.Count,
    ($sizes -join ', '))