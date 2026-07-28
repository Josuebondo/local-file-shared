param([string]$Root = (Resolve-Path "$PSScriptRoot\.."))

Add-Type -AssemblyName System.Drawing
$source = Join-Path $Root "public\localshare_icon.png"
$image = [System.Drawing.Image]::FromFile($source)
$sizes = @(1024, 512, 256, 128)

foreach ($size in $sizes) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.DrawImage($image, 0, 0, $size, $size)
  $target = if ($size -eq 1024) { Join-Path $Root "build\icon.png" } else { Join-Path $Root "build\icon-$size.png" }
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  if ($size -eq 256) {
    $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
    $stream = [IO.File]::Create((Join-Path $Root "build\icon.ico"))
    $icon.Save($stream)
    $stream.Close()
    $icon.Dispose()
  }
  $graphics.Dispose()
  $bitmap.Dispose()
}
$image.Dispose()
Copy-Item (Join-Path $Root "build\icon.png") (Join-Path $Root "public\favicon.png") -Force
Copy-Item (Join-Path $Root "build\icon.ico") (Join-Path $Root "public\favicon.ico") -Force

$chunks = @(@("ic10", "build\icon.png"), @("ic09", "build\icon-512.png"), @("ic08", "build\icon-256.png"), @("ic07", "build\icon-128.png"))
$body = New-Object Collections.Generic.List[byte]
foreach ($chunk in $chunks) {
  $data = [IO.File]::ReadAllBytes((Join-Path $Root $chunk[1]))
  $length = [BitConverter]::GetBytes([int](8 + $data.Length))
  [Array]::Reverse($length)
  $body.AddRange([Text.Encoding]::ASCII.GetBytes($chunk[0]))
  $body.AddRange($length)
  $body.AddRange($data)
}
$total = [BitConverter]::GetBytes([int](8 + $body.Count))
[Array]::Reverse($total)
$result = New-Object Collections.Generic.List[byte]
$result.AddRange([Text.Encoding]::ASCII.GetBytes("icns"))
$result.AddRange($total)
$result.AddRange($body)
[IO.File]::WriteAllBytes((Join-Path $Root "build\icon.icns"), $result.ToArray())
