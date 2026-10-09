$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Favicon: the mark alone is dark navy and disappears in a dark browser
# tab bar, and it is not square. So render it centred on a white rounded
# square — visible in both light and dark tab themes.
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

$out = Join-Path (Get-Location) 'app\icon.png'
New-Item -ItemType Directory -Force -Path 'app' | Out-Null
$canvas.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()
Write-Host ("favicon written: {0} ({1} KB)" -f $out, [math]::Round((Get-Item $out).Length/1KB,1))
