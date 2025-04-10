param(
    [switch]$verbose,
    [switch]$skipChecks,
    [switch]$help,
    [int]$backendPort = 5000,
    [int]$frontendPort = 3000
)

# Update these paths as needed
$frontendPath = "$PSScriptRoot/frontend"
$backendPath = "$PSScriptRoot/backend"

function Show-Help {
    Write-Host ""
    Write-Host "Usage: start-windows.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -verbose             Show detailed output from servers"
    Write-Host "  -skipChecks          Skip dependency checks"
    Write-Host "  -backendPort <port>  Set backend server port (default: 5000)"
    Write-Host "  -frontendPort <port> Set frontend server port (default: 3000)"
    Write-Host "  -help                Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  ./start-windows.ps1 -verbose"
    Write-Host "  ./start-windows.ps1 -backendPort 8000 -frontendPort 3001"
    exit
}

function Log ($level, $message) {
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = @{
        INFO = "Cyan"
        SUCCESS = "Green"
        ERROR = "Red"
    }[$level]
    Write-Host "[$timestamp] [$level] $message" -ForegroundColor $color
}

# Banner
Write-Host "================================================" -ForegroundColor Blue
Write-Host "  YouTube Transcriber - Development Environment " -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Blue

if ($help) {
    Show-Help
}

if (-not $skipChecks) {
    Log "INFO" "Checking dependencies..."
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Log "ERROR" "npm is not installed or not in PATH."
        exit 1
    }
    if (-not (Test-Path "$backendPath/.venv/Scripts/Activate.ps1")) {
        Log "ERROR" "Python virtual environment not found in backend."
        exit 1
    }
}

# FRONTEND SETUP
Log "INFO" "Installing frontend dependencies..."
Push-Location $frontendPath
npm install
if ($LASTEXITCODE -ne 0) {
    Log "ERROR" "Failed to install frontend dependencies."
    exit 1
}
Log "SUCCESS" "Frontend dependencies installed."

# Start frontend
$env:PORT = "$frontendPort"
$env:NODE_OPTIONS = "--openssl-legacy-provider"
Log "INFO" "Starting frontend server..."
if ($verbose) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run start-win"
} else {
    Start-Process powershell -WindowStyle Hidden -ArgumentList "-Command", "cd '$frontendPath'; npm run start-win > $null 2>&1"
}
Pop-Location

# BACKEND SETUP
Log "INFO" "Activating backend virtual environment and starting backend server..."
$backendScript = @"
cd '$backendPath'
. .venv/Scripts/Activate.ps1
$env:FLASK_RUN_PORT = '$backendPort'
flask run
"@

if ($verbose) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript
} else {
    Start-Process powershell -WindowStyle Hidden -ArgumentList "-Command", $backendScript
}

# Summary
Log "SUCCESS" "==============================================="
Log "SUCCESS" "Development environment running!"
Log "SUCCESS" "  Frontend: http://localhost:$frontendPort"
Log "SUCCESS" "  Backend:  http://localhost:$backendPort"
Log "SUCCESS" "==============================================="
Log "INFO" "Close the PowerShell windows to stop the servers"
