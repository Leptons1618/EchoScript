#!/bin/bash

# Color codes for terminal output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments
VERBOSE=false
for arg in "$@"; do
  case $arg in
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
  esac
done

# Function to log messages
log() {
  local level=$1
  local message=$2
  local color=$NC
  
  case $level in
    "INFO") color=$BLUE;;
    "SUCCESS") color=$GREEN;;
    "WARNING") color=$YELLOW;;
    "ERROR") color=$RED;;
  esac
  
  echo -e "${color}[$level] $message${NC}"
}

# Function to check if a command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Check environment and dependencies
check_dependencies() {
  log "INFO" "Checking dependencies..."
  
  if ! command_exists python; then
    log "ERROR" "Python not found. Please install Python 3.8+"
    exit 1
  fi
  
  if ! command_exists npm; then
    log "ERROR" "npm not found. Please install Node.js"
    exit 1
  fi
  
  if ! command_exists pip; then
    log "ERROR" "pip not found. Please ensure pip is installed"
    exit 1
  fi
  
  log "SUCCESS" "All required commands are available"
}

# Function to handle script termination
cleanup() {
  log "INFO" "Stopping servers..."
  
  if [[ -n $FRONTEND_PID ]] && ps -p $FRONTEND_PID > /dev/null; then
    kill $FRONTEND_PID
    log "SUCCESS" "Frontend server stopped"
  fi
  
  if [[ -n $BACKEND_PID ]] && ps -p $BACKEND_PID > /dev/null; then
    kill $BACKEND_PID
    log "SUCCESS" "Backend server stopped"
  fi
  
  log "SUCCESS" "Development environment shutdown complete"
  exit 0
}

# Set trap to catch termination signals
trap cleanup INT TERM

# Main execution
main() {
  # Print banner
  echo -e "${BLUE}======================================${NC}"
  echo -e "${GREEN}  YouTube Transcriber - Dev Launcher ${NC}"
  echo -e "${BLUE}======================================${NC}"
  
  # Check dependencies
  check_dependencies
  
  # Navigate to project root directory
  cd "$BASE_DIR" || { log "ERROR" "Failed to navigate to project directory"; exit 1; }
  
  # Start Flask backend server
  log "INFO" "Starting Flask backend server..."
  cd backend || { log "ERROR" "Backend directory not found"; exit 1; }
  
  # Check for virtual environment
  if [[ -d venv && -f venv/bin/activate ]]; then
    source backend/venv/bin/activate
    log "SUCCESS" "Virtual environment activated"
  else
    log "WARNING" "Virtual environment not found, creating one..."
    python -m venv venv || { log "ERROR" "Failed to create virtual environment"; exit 1; }
    source venv/bin/activate
    log "INFO" "Installing requirements..."
    pip install -r requirements.txt 2>/dev/null || log "WARNING" "No requirements.txt found, skipping pip install"
  fi
  
  # Start the backend server
  if $VERBOSE; then
    python app.py &
  else
    python app.py > /dev/null 2>&1 &
  fi
  BACKEND_PID=$!
  
  if ps -p $BACKEND_PID > /dev/null; then
    log "SUCCESS" "Backend server started with PID: $BACKEND_PID"
  else
    log "ERROR" "Failed to start backend server"
    exit 1
  fi
  
  # Wait for backend to initialize
  log "INFO" "Waiting for backend to initialize..."
  sleep 3
  
  # Start React frontend server
  log "INFO" "Starting React frontend server..."
  cd "$BASE_DIR/frontend" || { log "ERROR" "Frontend directory not found"; exit 1; }
  
  # Set NODE_OPTIONS for compatibility
  export NODE_OPTIONS=--openssl-legacy-provider
  
  # Start frontend
  if $VERBOSE; then
    npm start &
  else
    npm start > /dev/null 2>&1 &
  fi
  FRONTEND_PID=$!
  
  if ps -p $FRONTEND_PID > /dev/null; then
    log "SUCCESS" "Frontend server started with PID: $FRONTEND_PID"
  else
    log "ERROR" "Failed to start frontend server"
    kill $BACKEND_PID
    exit 1
  fi
  
  log "SUCCESS" "Development environment running at http://localhost:3000"
  log "INFO" "Press Ctrl+C to stop all services"
  
  # Keep script running
  wait
}

# Run the main function
main
