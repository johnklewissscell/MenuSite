# Kill any existing process on port 3000
$existingProcess = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($existingProcess) {
    Write-Host "Port 3000 is in use. Killing process $($existingProcess.OwningProcess)..." -ForegroundColor Yellow
    Stop-Process -Id $existingProcess.OwningProcess -Force
    Start-Sleep -Seconds 1
}

# Start the server
Write-Host "Starting server on port 3000..." -ForegroundColor Green
node server.js
