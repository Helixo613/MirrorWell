# Calm Band demo starter (Windows). Run from anywhere:
#   powershell -NoProfile -ExecutionPolicy Bypass -File <this folder>\start-demo.ps1
# Checks the network, then opens the MQTT broker and the backend in their own windows,
# waits for the band to report in, and opens MirrorWell in Chrome.
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$secrets = Join-Path $root 'calm-band\firmware\calm_band\secrets.h'
$mosq = 'C:\Program Files\mosquitto\mosquitto.exe'

function Ok($m)   { Write-Host "  OK    $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  WARN  $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  STOP  $m" -ForegroundColor Red }

Write-Host "`n1. Network" -ForegroundColor Cyan
$text = Get-Content $secrets -Raw
$ssid = [regex]::Match($text, '#define\s+WIFI_SSID\s+"([^"]*)"').Groups[1].Value
$host_ = [regex]::Match($text, '#define\s+MQTT_HOST\s+"([^"]*)"').Groups[1].Value
$wlan = netsh wlan show interfaces | Out-String
$curSsid = [regex]::Match($wlan, '(?m)^\s*SSID\s*:\s*(.+?)\s*$').Groups[1].Value
$band = [regex]::Match($wlan, '(?m)^\s*Band\s*:\s*(.+?)\s*$').Groups[1].Value
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias WiFi -ErrorAction SilentlyContinue).IPAddress
$fatal = $false
if ($curSsid -eq $ssid) { Ok "laptop is on '$ssid' (same network the band uses)" } else { Bad "laptop is on '$curSsid' but the band is flashed for '$ssid'"; $fatal = $true }
if ($band -match '2\.4') { Ok "hotspot band $band" } elseif ($band) { Bad "hotspot is on $band - turn on 'Maximize Compatibility' (2.4 GHz) on the phone"; $fatal = $true }
if ($ip -eq $host_) { Ok "laptop IP $ip matches MQTT_HOST in secrets.h" } else { Bad "laptop IP is $ip but the band is flashed to look for $host_ - edit MQTT_HOST in secrets.h and re-flash"; $fatal = $true }
if ($fatal) { Write-Host "`nFix the STOP items above, then run this again.`n" -ForegroundColor Red; exit 1 }

Write-Host "`n2. Broker" -ForegroundColor Cyan
$svc = Get-Service mosquitto -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') { Warn "Mosquitto Windows service is running (localhost only); stopping it needs admin"; Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-Command','Stop-Service mosquitto -Force; Set-Service mosquitto -StartupType Manual' }
$listen = Get-NetTCPConnection -LocalPort 1883 -State Listen -ErrorAction SilentlyContinue
if ($listen) { Ok "a broker is already listening on 1883 (reusing it)" }
else {
  Start-Process powershell -ArgumentList '-NoExit','-Command',"& '$mosq' -c '$root\mosquitto-calmband.conf' -v"
  Start-Sleep 2; Ok "broker started in its own window (click Allow if Windows Firewall asks)"
}

Write-Host "`n3. Backend" -ForegroundColor Cyan
$listen8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($listen8000) { Ok "backend already running on 8000 (reusing it)" }
else {
  Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File',"$root\start-backend.ps1"
  $deadline = (Get-Date).AddSeconds(20)
  do { Start-Sleep 1; try { $null = Invoke-RestMethod http://127.0.0.1:8000/api/companion/status; $up = $true } catch { $up = $false } } until ($up -or (Get-Date) -gt $deadline)
  if ($up) { Ok "backend up on http://localhost:8000" } else { Bad "backend did not start - look at its window"; exit 1 }
}

Write-Host "`n4. Band (plug it in now if it isn't; waiting up to 90 s)" -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(90)
do { $s = Invoke-RestMethod http://127.0.0.1:8000/api/companion/status; if ($s.online) { break }; Start-Sleep 3 } until ((Get-Date) -gt $deadline)
if ($s.online) { Ok "band online (boot $($s.boot)), state '$($s.state)', sensors pulse=$($s.sensors.pulse) motion=$($s.sensors.motion)" }
else { Warn "band not heard yet - check the blue LED (solid = connected, blinking = still trying)" }

if (-not $NoBrowser) { Start-Process 'http://localhost:8000' }
Write-Host "`nReady. Use the full setup in MirrorWell (not 'Try a demo')."
Write-Host "Pulse: finger LIGHTLY on the sensor, sensor face-UP, keep still ~75 s for 'usable'."
Write-Host "Never leave the pulse sensor face-down: a table reflection looks like a finger.`n"
