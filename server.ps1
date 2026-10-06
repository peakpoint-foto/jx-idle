$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$rootPrefix = $root + [IO.Path]::DirectorySeparatorChar
$mime = @{'.html'='text/html; charset=utf-8';'.css'='text/css; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.json'='application/json; charset=utf-8';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.webp'='image/webp';'.svg'='image/svg+xml';'.mp3'='audio/mpeg';'.woff2'='font/woff2'}
$listener = [Net.HttpListener]::new()
$port = 8080
while ($port -le 8100) { try { $listener.Prefixes.Clear(); $listener.Prefixes.Add("http://localhost:$port/"); $listener.Start(); break } catch { $port++; Start-Sleep -Milliseconds 100 } }
if (-not $listener.IsListening) { Write-Host 'Ports 8080-8100 are busy.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
$url = "http://localhost:$port/"
Write-Host 'Vo Lam Idle - local game server' -ForegroundColor Green
Write-Host "Open: $url" -ForegroundColor Cyan
Write-Host 'Keep this window open while playing. Press Ctrl+C to stop.' -ForegroundColor Gray
Start-Process $url
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/')).Replace('/',[IO.Path]::DirectorySeparatorChar)
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
      $file = [IO.Path]::GetFullPath([IO.Path]::Combine($root,$rel))
      if (($file -eq $root -or $file.StartsWith($rootPrefix,[StringComparison]::OrdinalIgnoreCase)) -and [IO.File]::Exists($file)) {
        $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
        $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $ctx.Response.Headers['Cache-Control'] = 'no-cache'
        $bytes = [IO.File]::ReadAllBytes($file)
        $ctx.Response.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -ne 'HEAD') { $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length) }
      } else { $ctx.Response.StatusCode = 404 }
    } catch { $ctx.Response.StatusCode = 400 }
    finally { $ctx.Response.Close() }
  }
} finally { $listener.Stop(); $listener.Close() }