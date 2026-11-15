# Calm Band SIMULATED demo starter (Windows, no hardware). Separate from the real-hardware
# start-demo.ps1 in the repo root, which it never touches.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File calm-band\sim\start-demo-sim.ps1 -Scenario settle
#   ... -Scenario mixed -Fast                 # 15x faster windows (tests / UI work)
#   ... -Headless                             # no new windows; logs in calm-band\sim\logs\<port>\
#   ... -MqttPort 1884 -HttpPort 8001         # a second, independent stack (parallel worktrees)
#   ... -Stop                                 # stop what -Headless started on these ports
#
# Starts: Mosquitto (the repo config's settings, but localhost-only so a real band can't join), the
# backend (serves dist\ + /api/companion on HttpPort) and calm-band\sim\sim_band.py.
param(
  [ValidateSet('settle','steady','rising','finger_off','moving','motor','dropout','mixed')]
  [string]$Scenario = 'settle',
  [switch]$Fast,
  [double]$StopAfter = -1,
  [int]$MqttPort = 1883,
  [int]$HttpPort = 8000,
  [switch]$Headless,
  [switch]$NoBrowser,
  [switch]$Stop
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = (Resolve-Path (Join-Path $here '..\..')).Path
$backendDir = Join-Path $root 'calm-band\backend-sample\backend'
$py = Join-Path $backendDir '.venv\Scripts\python.exe'
$mosq = 'C:\Program Files\mosquitto\mosquitto.exe'
$dist = Join-Path $root 'dist'
$logs = Join-Path $here "logs\$HttpPort"
$pidFile = Join-Path $logs 'pids.txt'
$base = "http://127.0.0.1:$HttpPort"

function Ok($m)   { Write-Host "  OK    $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  WARN  $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  STOP  $m" -ForegroundColor Red }
function Listening($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }

if ($Stop) {
  if (Test-Path $pidFile) {
    foreach ($p in Get-Content $pidFile) { cmd /c "taskkill /PID $p /T /F >nul 2>&1"; if ($LASTEXITCODE -eq 0) { Ok "stopped pid $p and its children" } }
    Remove-Item $pidFile
  } else { Warn "nothing recorded in $pidFile" }
  exit 0
}

New-Item -ItemType Directory -Force $logs | Out-Null

# Start a process in its own window (default) or hidden with logs (-Headless).
# Headless uses WMI so the children don't inherit this console's handles: otherwise anything that
# pipes or captures this script's output would wait for the servers to exit (i.e. forever).
function Launch($name, $exe, [string[]]$argv, $workdir, [hashtable]$envs = @{}) {
  if ($Headless) {
    $line = ($argv | ForEach-Object { if ($_ -match '[\s"]') { '"' + $_ + '"' } else { $_ } }) -join ' '
    $sets = ($envs.GetEnumerator() | ForEach-Object { "set `"$($_.Key)=$($_.Value)`"&& " }) -join ''
    $out = Join-Path $logs "$name.out.log"; $err = Join-Path $logs "$name.err.log"
    $cmd = "cmd.exe /c `"$sets`"$exe`" $line > `"$out`" 2> `"$err`"`""
    $si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
    $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd; CurrentDirectory = $workdir; ProcessStartupInformation = $si }
    if ($r.ReturnValue -ne 0) { Bad "could not start $name (WMI code $($r.ReturnValue))"; exit 1 }
    $id = $r.ProcessId
  } else {
    foreach ($k in $envs.Keys) { Set-Item "env:$k" $envs[$k] }
    $quoted = ($argv | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" }) -join ' '
    $cmd = "`$host.UI.RawUI.WindowTitle = 'calm-band sim: $name'; Set-Location '$workdir'; & '$exe' $quoted"
    $id = (Start-Process powershell -ArgumentList '-NoExit','-NoProfile','-Command',$cmd -PassThru).Id
  }
  Add-Content $pidFile $id
}

Write-Host "`nCalm Band SIMULATOR - scenario '$Scenario'$(if ($Fast) {' (fast x15)'}) - broker $MqttPort, backend $HttpPort" -ForegroundColor Cyan

Write-Host "`n1. Checks" -ForegroundColor Cyan
if (-not (Test-Path $py)) { Bad "no backend venv at $py - create it: python -m venv .venv; .venv\Scripts\pip install fastapi uvicorn paho-mqtt httpx"; exit 1 }
Ok "python venv $py"
if (Test-Path (Join-Path $dist 'index.html')) {
  $companion = Select-String -Path (Join-Path $dist 'assets\*.js') -Pattern '/api/companion' -SimpleMatch -List -ErrorAction SilentlyContinue
  if ($companion) { Ok "dist\ is built with companion mode" }
  else { Warn "dist\ was built WITHOUT companion mode - rebuild: `$env:VITE_COMPANION_ENABLED='true'; npm run build" }
} else { Warn "no dist\ - the API works, but there is no MirrorWell page. Build: `$env:VITE_COMPANION_ENABLED='true'; npm run build" }

Write-Host "`n2. Broker" -ForegroundColor Cyan
if (Listening $MqttPort) {
  $exposed = Get-NetTCPConnection -LocalPort $MqttPort -State Listen | Where-Object { $_.LocalAddress -ne '127.0.0.1' -and $_.LocalAddress -ne '::1' }
  if ($exposed) { Warn "the broker on $MqttPort listens on the network: a powered-on REAL band can connect and fight the simulator (same client id band-cb-01). Stop that broker or use -MqttPort 1884." }
  else { Ok "a localhost-only broker is already listening on $MqttPort (reusing it)" }
}
else {
  # Same settings as the repo's mosquitto-calmband.conf (anonymous, plain MQTT), but bound to
  # localhost only: the real band (flashed for this laptop's hotspot IP) must not reach the sim broker.
  $conf = Join-Path $logs 'mosquitto.conf'
  Set-Content -Path $conf -Encoding ascii -Value "listener $MqttPort 127.0.0.1`nallow_anonymous true"
  Launch 'mosquitto' $mosq @('-c', $conf, '-v') $root
  $deadline = (Get-Date).AddSeconds(10)
  while (-not (Listening $MqttPort) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300 }
  if (Listening $MqttPort) { Ok "broker started on $MqttPort ($conf)" } else { Bad "broker did not start (if the Mosquitto Windows service holds the port: Stop-Service mosquitto as admin)"; exit 1 }
}

Write-Host "`n3. Backend" -ForegroundColor Cyan
if (Listening $HttpPort) {
  $s = Invoke-RestMethod "$base/api/companion/status"
  if ($s.online -and $s.sensors.pulse -ne 'simulated') { Bad "a REAL band is online on this backend - not starting a simulated band next to it (it would take over its MQTT client id)"; exit 1 }
  Ok "backend already running on $HttpPort (reusing it)"
} else {
  $envs = @{ MQTT_HOST = '127.0.0.1'; MQTT_PORT = "$MqttPort"; DEVICE_ID = 'cb-01'; MIRRORWELL_DIST = $dist }
  Launch 'backend' $py @('-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', "$HttpPort") $backendDir $envs
  $deadline = (Get-Date).AddSeconds(30); $up = $false
  do { Start-Sleep 1; try { $null = Invoke-RestMethod "$base/api/companion/status"; $up = $true } catch { } } until ($up -or (Get-Date) -gt $deadline)
  if ($up) { Ok "backend up on $base" } else { Bad "backend did not start - see its window / $logs\backend.err.log"; exit 1 }
}

Write-Host "`n4. Simulated band" -ForegroundColor Cyan
$simArgs = @('-u', (Join-Path $here 'sim_band.py'), '--scenario', $Scenario, '--port', "$MqttPort")
if ($Fast) { $simArgs += '--fast' }
if ($StopAfter -ge 0) { $simArgs += @('--stop-after', "$StopAfter") }
Launch 'band' $py $simArgs $here
$deadline = (Get-Date).AddSeconds(15)
do { Start-Sleep 1; $s = Invoke-RestMethod "$base/api/companion/status" } until ($s.online -or (Get-Date) -gt $deadline)
if ($s.online) { Ok "band online (boot $($s.boot)), state '$($s.state)'" } else { Warn "band not heard yet - see its window / $logs\band.out.log" }

Write-Host "`nURLs" -ForegroundColor Cyan
Write-Host "  MirrorWell        http://localhost:$HttpPort/"
Write-Host "  Status (JSON)     $base/api/companion/status"
Write-Host "  Reviewer (JSON)   $base/api/companion/reviewer/sessions"
Write-Host "  Test buzz         Invoke-RestMethod -Method Post $base/api/companion/_test/command -ContentType application/json -Body '{""pattern"":""rep_pulse""}'"
Write-Host "  Test hooks        & 'C:\Program Files\mosquitto\mosquitto_pub.exe' -h 127.0.0.1 -p $MqttPort -t calmband/cb-01/sim -m '{""contact"":false}'"
if ($Headless) { Write-Host "  Logs              $logs   (stop with: -Stop -HttpPort $HttpPort)" }
$first = if ($Fast) { '~5 s' } else { '~40 s' }
Write-Host "`nFirst reading in $first; 'usable' needs a clean window.`n"
if (-not $NoBrowser -and -not $Headless) { Start-Process "http://localhost:$HttpPort" }
