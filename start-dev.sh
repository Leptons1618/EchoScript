#!/bin/bash

# Color codes for terminal output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default configuration
VERBOSE=false
SKIP_CHECKS=false
BACKEND_PORT=5000
FRONTEND_PORT=3000
HELP=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
    -s|--skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    -bp|--backend-port)
      BACKEND_PORT="$2"
      shift 2
      ;;
    -fp|--frontend-port)
      FRONTEND_PORT="$2"
      shift 2
      ;;
    -h|--help)
      HELP=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      HELP=true
      shift
      ;;
  esac
done

# Function to display help information
show_help() {
  echo -e "${BOLD}YouTube Transcriber - Development Environment Launcher${NC}"
  echo ""
  echo "Usage: ./start-dev.sh [options]"
  echo ""
  echo "Options:"
  echo "  -v, --verbose         Show detailed output from servers"
  echo "  -s, --skip-checks     Skip dependency checks"
  echo "  -bp, --backend-port   Set backend server port (default: 5000)"
  echo "  -fp, --frontend-port  Set frontend server port (default: 3000)"
  echo "  -h, --help            Show this help message"
  echo ""
  echo "Examples:"
  echo "  ./start-dev.sh --verbose"
  echo "  ./start-dev.sh --backend-port 8000 --frontend-port 3001"
  echo ""
}

# Show help if requested
if $HELP; then
  show_help
  exit 0
fi

# Function to log messages
log() {
  local level=$1
  local message=$2
  local color=$NC
  local timestamp=$(date "+%H:%M:%S")
  
  case $level in
    "INFO") color=$BLUE;;
    "SUCCESS") color=$GREEN;;
    "WARNING") color=$YELLOW;;
    "ERROR") color=$RED;;
    "STEP") color=$CYAN;;
  esac
  
  echo -e "${color}[$level]${NC} ${timestamp} ${message}"
}

# Function to check if a command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Function to check Python version
check_python_version() {
  local version=$(python --version 2>&1 | awk '{print $2}')
  local major=$(echo $version | cut -d. -f1)
  local minor=$(echo $version | cut -d. -f2)
  
  if [[ $major -lt 3 || ($major -eq 3 && $minor -lt 8) ]]; then
    log "ERROR" "Python 3.8+ is required, but you have $version"
    return 1
  fi
  
  log "SUCCESS" "Python version $version is compatible"
  return 0
}

# Check environment and dependencies
check_dependencies() {
  if $SKIP_CHECKS; then
    log "WARNING" "Skipping dependency checks as requested"
    return 0
  fi

  log "STEP" "Checking dependencies..."
  
  if ! command_exists python; then
    log "ERROR" "Python not found. Please install Python 3.8+"
    return 1
  fi
  
  if ! check_python_version; then
    return 1
  fi
  
  if ! command_exists npm; then
    log "ERROR" "npm not found. Please install Node.js"
    return 1
  fi
  
  if ! command_exists pip; then
    log "ERROR" "pip not found. Please ensure pip is installed"
    return 1
  fi
  
  if ! command_exists ffmpeg; then
    log "WARNING" "ffmpeg not found. Audio transcription may not work correctly"
    log "INFO" "Install ffmpeg using your package manager or from https://ffmpeg.org/download.html"
  else
    log "SUCCESS" "ffmpeg is available"
  fi
  
  log "SUCCESS" "All required commands are available"
  return 0
}

# Function to handle script termination
cleanup() {
  echo ""
  log "STEP" "Stopping servers..."
  
  if [[ -n $FRONTEND_PID ]] && ps -p $FRONTEND_PID > /dev/null; then
    kill $FRONTEND_PID
    log "SUCCESS" "Frontend server stopped (PID: $FRONTEND_PID)"
  else
    log "WARNING" "Frontend server was not running or already stopped"
  fi
  
  if [[ -n $BACKEND_PID ]] && ps -p $BACKEND_PID > /dev/null; then
    kill $BACKEND_PID
    log "SUCCESS" "Backend server stopped (PID: $BACKEND_PID)"
  else
    log "WARNING" "Backend server was not running or already stopped"
  fi
  
  log "SUCCESS" "Development environment shutdown complete"
  exit 0
}

# Function to setup virtual environment
setup_venv() {
  log "STEP" "Setting up Python virtual environment..."
  
  # Check if venv exists
  if [[ ! -d "$BASE_DIR/backend/.venv" ]]; then
    log "INFO" "Creating virtual environment..."
    python -m venv backend/.venv || { 
      log "ERROR" "Failed to create virtual environment" 
      return 1
    }
    log "SUCCESS" "Virtual environment created at backend/.venv"
  fi
  
  # Activate virtual environment
  if [[ -f "$BASE_DIR/backend/.venv/bin/activate" ]]; then
    source "$BASE_DIR/backend/.venv/bin/activate" || {
      log "ERROR" "Failed to activate virtual environment"
      return 1
    }
    log "SUCCESS" "Virtual environment activated"
  elif [[ -f "$BASE_DIR/backend/.venv/Scripts/activate" ]]; then
    # Windows with Git Bash or similar
    source "$BASE_DIR/backend/.venv/Scripts/activate" || {
      log "ERROR" "Failed to activate virtual environment"
      return 1
    }
    log "SUCCESS" "Virtual environment activated (Windows)"
  else
    log "ERROR" "Could not find activate script in virtual environment"
    return 1
  fi
  
  # Check if dependencies need to be installed
  log "INFO" "Checking Python dependencies..."
  if [[ ! -f "$BASE_DIR/backend/requirements.txt" ]]; then
    log "WARNING" "No requirements.txt found in backend directory"
  else
    if pip list | grep -q "flask"; then
      log "SUCCESS" "Dependencies already installed"
    else
      log "INFO" "Installing backend dependencies..."
      pip install -r "$BASE_DIR/backend/requirements.txt" || {
        log "ERROR" "Failed to install Python dependencies"
        return 1
      }
      log "SUCCESS" "Dependencies installed successfully"
    fi
  fi
  
  return 0
}

# Function to check if port is already in use
is_port_in_use() {
  local port=$1
  if command_exists lsof; then
    lsof -i :$port &> /dev/null
    return $?
  elif command_exists netstat; then
    netstat -tuln | grep -q ":$port "
    return $?
  else
    # Default to assuming port is free if we can't check
    return 1
  fi
}

# Set trap to catch termination signals
trap cleanup INT TERM

# Main execution
main() {
  # Print banner
  echo -e "${BLUE}================================================${NC}"
  echo -e "${GREEN}  YouTube Transcriber - Development Environment ${NC}"
  echo -e "${BLUE}================================================${NC}"
  
  # Log configuration
  log "INFO" "Starting with configuration:"
  log "INFO" "  Backend Port: $BACKEND_PORT"
  log "INFO" "  Frontend Port: $FRONTEND_PORT"
  log "INFO" "  Verbose Mode: $VERBOSE"
  
  # Check dependencies
  check_dependencies || { 
    log "ERROR" "Dependency check failed. Fix the issues or use --skip-checks to bypass"
    exit 1
  }
  
  # Navigate to project root directory
  cd "$BASE_DIR" || { 
    log "ERROR" "Failed to navigate to project directory: $BASE_DIR" 
    exit 1
  }
  
  # Check if ports are available
  if is_port_in_use $BACKEND_PORT; then
    log "ERROR" "Port $BACKEND_PORT is already in use. Specify a different port with --backend-port"
    exit 1
  fi
  
  if is_port_in_use $FRONTEND_PORT; then
    log "ERROR" "Port $FRONTEND_PORT is already in use. Specify a different port with --frontend-port"
    exit 1
  fi
  
  # Set up and activate virtual environment
  setup_venv || {
    log "ERROR" "Failed to set up virtual environment"
    exit 1
  }
  
  # Start Flask backend server
  log "STEP" "Starting Flask backend server on port $BACKEND_PORT..."
  cd "$BASE_DIR/backend" || { 
    log "ERROR" "Backend directory not found" 
    exit 1
  }
  
  # Set environment variables for ports
  export FLASK_PORT=$BACKEND_PORT
  
  # Start the backend server
  if $VERBOSE; then
    python app.py &
  else
    python app.py > /dev/null 2>&1 &
  fi
  BACKEND_PID=$!
  
  # Verify backend started successfully
  sleep 2
  if ps -p $BACKEND_PID > /dev/null; then
    log "SUCCESS" "Backend server started with PID: $BACKEND_PID"
  else
    log "ERROR" "Failed to start backend server"
    exit 1
  fi
  
  # Wait for backend to initialize
  log "INFO" "Waiting for backend to initialize..."
  sleep 3
  
  # Check if backend is responding
  if command_exists curl; then
    if ! curl -s "http://localhost:$BACKEND_PORT" > /dev/null; then
      log "WARNING" "Backend server does not appear to be responding, but continuing anyway"
    else
      log "SUCCESS" "Backend server is responding at http://localhost:$BACKEND_PORT"
    fi
  fi
  
  # Start React frontend server
  log "STEP" "Starting React frontend server on port $FRONTEND_PORT..."
  cd "$BASE_DIR/frontend" || { 
    log "ERROR" "Frontend directory not found"
    kill $BACKEND_PID
    exit 1
  }
  
  # Check node modules
  if [[ ! -d "$BASE_DIR/frontend/node_modules" ]]; then
    log "INFO" "Installing frontend dependencies..."
    npm install || {
      log "ERROR" "Failed to install frontend dependencies"
      kill $BACKEND_PID
      exit 1
    }
    log "SUCCESS" "Frontend dependencies installed"
  fi
  
  # Set NODE_OPTIONS for compatibility
  export NODE_OPTIONS=--openssl-legacy-provider
  
  # Set PORT environment variable for React
  export PORT=$FRONTEND_PORT
  
  # Start frontend
  if $VERBOSE; then
    npm start &
  else
    npm start > /dev/null 2>&1 &
  fi
  FRONTEND_PID=$!
  
  # Verify frontend started successfully
  sleep 5
  if ps -p $FRONTEND_PID > /dev/null; then
    log "SUCCESS" "Frontend server started with PID: $FRONTEND_PID"
  else
    log "ERROR" "Failed to start frontend server"
    kill $BACKEND_PID
    exit 1
  fi
  
  # Print success message
  echo ""
  log "SUCCESS" "==============================================="
  log "SUCCESS" "Development environment running!"
  log "SUCCESS" "  Frontend: http://localhost:$FRONTEND_PORT"
  log "SUCCESS" "  Backend:  http://localhost:$BACKEND_PORT"
  log "SUCCESS" "==============================================="
  log "INFO" "Press Ctrl+C to stop all services"
  echo ""
  
  # Keep script running
  wait
}

# Run the main function
main
