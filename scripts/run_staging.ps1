# Loads server/.env (KEY=VALUE) and runs uvicorn in staging mode
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$envPath = "server\.env"
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*#') { return }
    if ($_ -match '^\s*$') { return }
    $k,$v = $_ -split '=',2
    if ($k) { [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim()) }
  }
}
python -m pip install --upgrade pip
pip install -r server\requirements.txt -q
uvicorn server.api.main:app --host 0.0.0.0 --port 8000 --reload
