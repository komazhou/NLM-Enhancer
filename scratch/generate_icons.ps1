Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\komazhou\.gemini\antigravity\brain\523fc423-4f1b-4285-88af-f1094fb8d1ac\extension_icon_1776960066592.png"
$outDir = "d:\Dev_Git\NotebookLM++\icons"

$img = [System.Drawing.Image]::FromFile($srcPath)

foreach ($size in @(16, 48, 128)) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($img, 0, 0, $size, $size)
    $bmp.Save("$outDir\icon$size.png")
    $graphics.Dispose()
    $bmp.Dispose()
}

$img.Dispose()
Write-Output "Icons generated: icon16.png, icon48.png, icon128.png"
