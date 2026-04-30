# PowerShell variant van dump-database.sh — voor Windows-gebruikers
# Gebruik: powershell -File scripts\dump-database.ps1

$ErrorActionPreference = "Stop"

$outDir = "docs/sql-dump"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Detecteer container
$container = (docker ps --filter "ancestor=mysql:8" --format "{{.Names}}" | Select-Object -First 1)
if (-not $container) {
  Write-Host "[X] Geen MySQL-container draaiend. Run eerst: docker compose up -d" -ForegroundColor Red
  exit 1
}
Write-Host "-> Container: $container"

$pass = if ($env:DB_PASS) { $env:DB_PASS } else { "pingfin_dev_password" }

foreach ($db in @("pingfin_b1", "pingfin_b2")) {
  $out = "$outDir/${db}_dump.sql"
  Write-Host "-> Dumping $db -> $out"
  docker exec $container mysqldump -u root -p"$pass" --databases $db --add-drop-database --single-transaction --skip-lock-tables 2>$null | Out-File -Encoding UTF8 $out
  $lines = (Get-Content $out | Measure-Object -Line).Lines
  Write-Host "   OK $lines lines"
}

$combined = "$outDir/pingfin_full_dump.sql"
Write-Host "-> Combined dump -> $combined"
docker exec $container mysqldump -u root -p"$pass" --databases pingfin_b1 pingfin_b2 --add-drop-database --single-transaction 2>$null | Out-File -Encoding UTF8 $combined
$lines = (Get-Content $combined | Measure-Object -Line).Lines
Write-Host "   OK $lines lines"

Write-Host ""
Write-Host "[OK] Dumps in $outDir/" -ForegroundColor Green
Get-ChildItem $outDir | Format-Table Name, Length, LastWriteTime
