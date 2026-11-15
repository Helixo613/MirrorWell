param([switch]$FreshDb)
# Starts the Calm Band backend and serves the built MirrorWell PWA on http://localhost:8000
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:MQTT_HOST = "127.0.0.1"
$env:MQTT_PORT = "1883"
$env:DEVICE_ID = "cb-01"
$env:MIRRORWELL_DIST = Join-Path $root "dist"
$env:CALMBAND_DB = Join-Path $root "calm-band\backend-sample\backend\data\calmband-demo.db"
if ($FreshDb -and (Test-Path $env:CALMBAND_DB)) { Move-Item $env:CALMBAND_DB (Join-Path (Split-Path $env:CALMBAND_DB) ("calmband-demo-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".db")) }
Set-Location (Join-Path $root "calm-band\backend-sample\backend")
& .\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8000
