$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src_dir = 'C:\Users\DiepreyeCD\Downloads'
$out_dir = 'C:\Users\DiepreyeCD\Documents\nextep-saas\public\brand'
New-Item -ItemType Directory -Force -Path $out_dir | Out-Null

function Get-ContentBounds([string]$path) {
    $src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $path))
    $origW = $src.Width
    $origH = $src.Height

    # Downsample first so the alpha scan is ~65k pixels, not 4M.
    $sw = 256
    $sh = [int](256 * $origH / $origW)
    $small = New-Object System.Drawing.Bitmap $sw, $sh
    $g = [System.Drawing.Graphics]::FromImage($small)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.DrawImage($src, 0, 0, $sw, $sh)
    $g.Dispose()

    $minX = $sw; $minY = $sh; $maxX = -1; $maxY = -1
    for ($y = 0; $y -lt $sh; $y++) {
        for ($x = 0; $x -lt $sw; $x++) {
            if ($small.GetPixel($x, $y).A -gt 12) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    $small.Dispose()
    if ($maxX -lt 0) { $src.Dispose(); return $null }

    # Pad by a couple of small-image px so edges aren't clipped.
    $pad = 2
    $minX = [Math]::Max(0, $minX - $pad); $minY = [Math]::Max(0, $minY - $pad)
    $maxX = [Math]::Min($sw - 1, $maxX + $pad); $maxY = [Math]::Min($sh - 1, $maxY + $pad)

    $scale = $origW / $sw
    $bounds = @{
        x = [int]($minX * $scale); y = [int]($minY * $scale)
        w = [int](($maxX - $minX + 1) * $scale); h = [int](($maxY - $minY + 1) * $scale)
    }
    $src.Dispose()
    return $bounds
}

function Export-Logo([string]$file, [int]$targetW) {
    $path = Join-Path $src_dir "$file.png"
    if (-not (Test-Path $path)) { Write-Host "MISSING $path"; return }

    $b = Get-ContentBounds $path
    if (-not $b) { Write-Host "NO CONTENT $file"; return }

    $src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $path))
    $crop = [Math]::Min($b.w, $b.h)
    $ratio = $targetW / $b.w
    $tw = $targetW
    $th = [Math]::Max(1, [int]($b.h * $ratio))

    $dest = New-Object System.Drawing.Bitmap $tw, $th
    $dest.SetResolution(300, 300)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.CompositingMode = 'SourceCopy'
    $g.CompositingQuality = 'HighQuality'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.SmoothingMode = 'HighQuality'
    $g.PixelOffsetMode = 'HighQuality'
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src,
        (New-Object System.Drawing.Rectangle 0, 0, $tw, $th),
        (New-Object System.Drawing.Rectangle $b.x, $b.y, $b.w, $b.h),
        [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()

    $out = Join-Path $out_dir "$file.png"
    $dest.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $dest.Dispose(); $src.Dispose()

    $kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
    Write-Host ("{0,-28} cropped {1}x{2} -> {3}x{4}  ({5} KB)" -f $file, $b.w, $b.h, $tw, $th, $kb)
}

# target widths are ~2x the largest rendered size for crispness on retina
Export-Logo 'nexstepper-horizontal-clean' 640
Export-Logo 'nexstepper-stacked-clean' 420
Export-Logo 'nexstepper-icon-clean' 256