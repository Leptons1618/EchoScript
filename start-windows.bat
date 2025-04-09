@echo off
setlocal enabledelayedexpansion

REM Color definitions for Windows console
set "GREEN=[92m"
set "BLUE=[94m"
set "YELLOW=[93m"
set "RED=[91m"
set "CYAN=[96m"
set "WHITE=[97m"
set "BOLD=[1m"
set "NC=[0m"

REM Default configuration
set VERBOSE=0
set SKIP_CHECKS=0
set BACKEND_PORT=5000
set FRONTEND_PORT=3000
set HELP=0

REM Banner
echo %BLUE%================================================%NC%
echo %GREEN%  YouTube Transcriber - Development Environment %NC%
echo %BLUE%================================================%NC%

REM Parse command line arguments
:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="-v" set VERBOSE=1
if /i "%~1"=="--verbose" set VERBOSE=1
if /i "%~1"=="-s" set SKIP_CHECKS=1
if /i "%~1"=="--skip-checks" set SKIP_CHECKS=1
if /i "%~1"=="-h" set HELP=1
if /i "%~1"=="--help" set HELP=1
if /i "%~1"=="-bp" (
    set BACKEND_PORT=%~2
    shift
)
if /i "%~1"=="--backend-port" (
    set BACKEND_PORT=%~2
    shift
)
if /i "%~1"=="-fp" (
    set FRONTEND_PORT=%~2
    shift
)
if /i "%~1"=="--frontend-port" (
    set FRONTEND_PORT=%~2
    shift
)
shift
goto :parse_args
:args_done

REM Show help if requested
if %HELP%==1 (
    echo %BOLD%YouTube Transcriber - Development Environment Launcher%NC%
    echo.
    echo Usage: start-windows.bat [options]
    echo.
    echo Options:
    echo   -v, --verbose         Show detailed output from servers
    echo   -s, --skip-checks     Skip dependency checks
    echo   -bp, --backend-port   Set backend server port (default: 5000)
    echo   -fp, --frontend-port  Set frontend server port (default: 3000)
    echo   -h, --help            Show this help message
    echo.
    echo Examples:
    echo   start-windows.bat --verbose
    echo   start-windows.bat --backend-port 8000 --frontend-port 3001
    echo.
    exit /b 0
)

REM Log function
:log
set "level=%~1"
set "message=%~2"
set "color=%NC%"
for /f "tokens=1-3 delims=:" %%a in ("%time%") do set "timestamp=%%a:%%b:%%c"

if "%level%"=="INFO" set "color=%BLUE%"
if "%level%"=="SUCCESS" set "color=%GREEN%"
if "%level%"=="WARNING" set "color=%YELLOW%"
if "%level%"=="ERROR" set "color=%RED%"
if "%level%"=="STEP" set "color=%CYAN%"

echo %color%[%level%]%NC% %timestamp:~0,8% %message%
goto :eof

REM Display configuration
call :log "INFO" "Starting with configuration:"
call :log "INFO" "  Backend Port: %BACKEND_PORT%"
call :log "INFO" "  Frontend Port: %FRONTEND_PORT%"
call :log "INFO" "  Verbose Mode: %VERBOSE%"

REM Check dependencies if not skipped
if %SKIP_CHECKS%==1 (
    call :log "WARNING" "Skipping dependency checks as requested"
) else (
    call :log "STEP" "Checking dependencies..."
    
    REM Check Python
    where python >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        call :log "ERROR" "Python not found. Please install Python 3.8+"
        exit /b 1
    )
    
    REM Check Python version
    for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
    for /f "tokens=1,2 delims=." %%a in ("%PYTHON_VERSION%") do (
        set PYTHON_MAJOR=%%a
        set PYTHON_MINOR=%%b
    )
    
    if %PYTHON_MAJOR% LSS 3 (
        call :log "ERROR" "Python 3.8+ is required, but you have %PYTHON_VERSION%"
        exit /b 1
    ) else (
        if %PYTHON_MAJOR% EQU 3 (
            if %PYTHON_MINOR% LSS 8 (
                call :log "ERROR" "Python 3.8+ is required, but you have %PYTHON_VERSION%"
                exit /b 1
            )
        )
    )
    call :log "SUCCESS" "Python version %PYTHON_VERSION% is compatible"
    
    REM Check Node.js/npm
    where npm >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        call :log "ERROR" "npm not found. Please install Node.js"
        exit /b 1
    )
    call :log "SUCCESS" "npm is available"
    
    REM Check ffmpeg
    where ffmpeg >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        call :log "WARNING" "ffmpeg not found. Audio transcription may not work correctly"
        call :log "INFO" "Install ffmpeg from https://ffmpeg.org/download.html and add to PATH"
    ) else (
        call :log "SUCCESS" "ffmpeg is available"
    )
    
    call :log "SUCCESS" "All required commands are available"
)

REM Check for virtual environment and set it up if needed
call :log "STEP" "Setting up Python virtual environment..."
if not exist "backend\venv" (
    call :log "INFO" "Creating virtual environment..."
    python -m venv backend\venv
    if %ERRORLEVEL% neq 0 (
        call :log "ERROR" "Failed to create virtual environment"
        exit /b 1
    )
    call :log "SUCCESS" "Virtual environment created at backend\venv"
)

REM Install dependencies if needed
if exist "backend\requirements.txt" (
    call :log "INFO" "Checking Python dependencies..."
    if not exist "backend\venv\Scripts\pip.exe" (
        call :log "ERROR" "Virtual environment seems corrupted, pip not found"
        exit /b 1
    )
    
    REM Check if flask is already installed
    backend\venv\Scripts\pip.exe list | findstr "flask" >nul
    if %ERRORLEVEL% neq 0 (
        call :log "INFO" "Installing backend dependencies..."
        backend\venv\Scripts\pip.exe install -r backend\requirements.txt
        if %ERRORLEVEL% neq 0 (
            call :log "ERROR" "Failed to install Python dependencies"
            exit /b 1
        )
        call :log "SUCCESS" "Dependencies installed successfully"
    ) else (
        call :log "SUCCESS" "Dependencies already installed"
    )
) else (
    call :log "WARNING" "No requirements.txt found in backend directory"
)

REM Check if ports are in use
call :log "INFO" "Checking if ports are available..."
netstat -ano | findstr ":%BACKEND_PORT% " >nul
if %ERRORLEVEL% equ 0 (
    call :log "ERROR" "Port %BACKEND_PORT% is already in use. Specify a different port with --backend-port"
    exit /b 1
)

netstat -ano | findstr ":%FRONTEND_PORT% " >nul
if %ERRORLEVEL% equ 0 (
    call :log "ERROR" "Port %FRONTEND_PORT% is already in use. Specify a different port with --frontend-port"
    exit /b 1
)

REM Start Backend in a new window
call :log "STEP" "Starting Flask backend server on port %BACKEND_PORT%..."
set "FLASK_PORT=%BACKEND_PORT%"

if %VERBOSE%==1 (
    start cmd /k "cd backend && ..\backend\venv\Scripts\activate && python app.py"
) else (
    start cmd /k "cd backend && ..\backend\venv\Scripts\activate && python app.py >nul 2>&1"
)

REM Wait for backend to initialize
call :log "INFO" "Waiting for backend to initialize..."
timeout /t 5 /nobreak >nul

REM Check if backend is responding
call :log "INFO" "Checking backend server status..."
curl -s "http://localhost:%BACKEND_PORT%" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    call :log "WARNING" "Backend server does not appear to be responding, but continuing anyway"
) else (
    call :log "SUCCESS" "Backend server is responding at http://localhost:%BACKEND_PORT%"
)

REM Start Frontend
call :log "STEP" "Starting React frontend server on port %FRONTEND_PORT%..."
cd frontend

REM Install frontend dependencies if node_modules doesn't exist
if not exist "node_modules" (
    call :log "INFO" "Installing frontend dependencies..."
    npm install
    if %ERRORLEVEL% neq 0 (
        call :log "ERROR" "Failed to install frontend dependencies"
        exit /b 1
    )
    call :log "SUCCESS" "Frontend dependencies installed"
)

REM Set environment variables for React
set "PORT=%FRONTEND_PORT%"
set "NODE_OPTIONS=--openssl-legacy-provider"

REM Start frontend
call :log "INFO" "Starting frontend server..."
if %VERBOSE%==1 (
    start cmd /k "npm run start-win"
) else (
    start cmd /k "npm run start-win >nul 2>&1"
)

REM Print success message
echo.
call :log "SUCCESS" "==============================================="
call :log "SUCCESS" "Development environment running!"
call :log "SUCCESS" "  Frontend: http://localhost:%FRONTEND_PORT%"
call :log "SUCCESS" "  Backend:  http://localhost:%BACKEND_PORT%"
call :log "SUCCESS" "==============================================="
call :log "INFO" "Close the console windows to stop the servers"
echo.

REM Keep window open
pause
exit /b 0
