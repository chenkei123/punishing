Add-Type -AssemblyName System.Drawing
$f = 'c:\Users\WQ383\OneDrive\Desktop\新二创网站\backgrounds\mc UI.png'
$img = [System.Drawing.Image]::FromFile($f)
Write-Output "Width: $($img.Width)"
Write-Output "Height: $($img.Height)"
Write-Output "PixelFormat: $($img.PixelFormat)"
$img.Dispose()
