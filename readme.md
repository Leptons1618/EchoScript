# YouTube Video Transcriber

A full-featured application that transcribes YouTube videos, generates AI-powered notes, and provides synchronized video playback with interactive transcripts. Built with Python, Flask, and React.

## Features

### Transcription & Analysis
- **Transcription of YouTube videos** using OpenAI's Whisper or Faster-Whisper
- **Synchronized video and transcript** - click on text to jump to that point in the video
- **AI-generated smart notes and summaries** with customizable formatting

### User Experience
- **Advanced search capabilities**:
  - Full-text search within transcripts
  - Keyboard shortcuts (Enter to search, F3/Shift+F3 to navigate results, Esc to clear)
  - Result highlighting and navigation
- **Filtering and organization**:
  - Filter by status, date range
  - Sort alphabetically or by date
  - Search by title or content
- **Multiple export formats** (PDF, TXT, Notion)
- **Responsive design** with dark/light mode support
- **Persistent theme settings** that remember your preferences

### Technical Features
- **Real-time transcription feedback** with animated progress updates
- **Detailed model configuration** with size/performance options
- **Job history and status tracking**
- **Notion integration** for seamless export of transcripts and notes

## Quick Start

For development, you can use the included start script:

```bash
# On Linux/Mac
./start-dev.sh

# With verbose output
./start-dev.sh --verbose
```

This script automatically:
- Checks for required dependencies
- Sets up virtual environment if needed
- Starts the Flask backend server
- Launches the React frontend
- Handles clean shutdown of services

## Prerequisites

- **Python 3.8+** with pip
- **Node.js 14+** with npm
- **ffmpeg** (required for audio processing)
- **CUDA-compatible GPU** recommended for faster processing (optional but highly recommended for medium/large models)

## Backend Setup

1. Create a project directory and set up a Python virtual environment:

```bash
mkdir -p youtube-transcriber/backend
cd youtube-transcriber/backend
python -m venv venv

# Activate the virtual environment
# On Windows
venv\Scripts\activate
# On macOS/Linux
source venv/bin/activate
```

2. Install the dependencies:

```bash
pip install flask flask-cors whisper faster-whisper yt-dlp transformers nltk torch notion-client
```

3. Install ffmpeg (if not already installed):

- **macOS**: `brew install ffmpeg`
- **Ubuntu/Debian**: `sudo apt install ffmpeg`
- **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

## Frontend Setup

1. Create a new React application:

```bash
cd .. 
npx create-react-app frontend
cd frontend
```

2. Install additional dependencies:

```bash
npm install react-router-dom jspdf axios
```

## Running the Application

### Development Environment

The project includes scripts for both Linux/Mac and Windows to easily set up and run the development environment:

#### Linux/Mac (start-dev.sh)

```bash
# Basic usage
./start-dev.sh

# Show server output (verbose mode)
./start-dev.sh --verbose

# Skip dependency checks
./start-dev.sh --skip-checks

# Customize ports
./start-dev.sh --backend-port 8000 --frontend-port 3001

# Show all available options
./start-dev.sh --help
```

#### Windows (start-windows.bat)

```batch
# Basic usage
start-windows.bat

# Show server output (verbose mode)
start-windows.bat --verbose

# Skip dependency checks
start-windows.bat --skip-checks

# Customize ports
start-windows.bat --backend-port 8000 --frontend-port 3001

# Show all available options
start-windows.bat --help
```

Both scripts support the following options:
- `-v, --verbose`: Display detailed output from servers
- `-s, --skip-checks`: Skip dependency verification
- `-bp, --backend-port`: Change backend server port (default: 5000)
- `-fp, --frontend-port`: Change frontend server port (default: 3000)
- `-h, --help`: Display help information

The scripts will automatically:
1. Verify Python, Node.js, and ffmpeg installations
2. Create/activate a Python virtual environment
3. Install required dependencies if needed
4. Start the backend Flask server
5. Start the React frontend server
6. Provide URLs to access the application

### Manual Setup

If you prefer to start the services manually:

```bash
# Start backend
cd backend
python app.py

# In a new terminal, start frontend
cd frontend
npm start
```

After starting the application, access it in your browser at `http://localhost:3000`

### On Windows:
Option 1: Use the provided batch script
```
start-windows.bat
```

Option 2: Run commands manually
```
# Start backend
cd backend
python app.py

# In a new terminal, start frontend
cd frontend
npm run start-win
```

3. Access the application in your browser at `http://localhost:3000`

## System Architecture

### Backend Components

- **Flask Web Server** - Handles HTTP requests and serves the API
- **Whisper/Faster-Whisper Models** - State-of-the-art speech recognition
- **YouTube Downloader** - Uses yt-dlp to extract audio
- **BART Summarization Model** - Generates notes and summaries
- **Persistent Storage** - Saves transcripts, notes, and configuration settings

### Frontend Structure

- **Home Page** - URL input and model configuration
- **Transcription View** - Video player, synchronized transcript, and smart notes
- **Jobs List** - Search and filter previous transcriptions
- **Responsive UI** - Adapts to different screen sizes
- **Theme Support** - Dark/light mode with persistent settings

## Model Configuration

The application supports two transcription engines:

1. **Whisper** - Original OpenAI model
2. **Faster-Whisper** - CTranslate2-powered optimized version

Available model sizes:
- **tiny** - 39M parameters, fastest, least accurate
- **base** - 74M parameters
- **small** - 244M parameters, good balance
- **medium** - 769M parameters, more accurate
- **large** - 1550M parameters (only with faster-whisper), most accurate
- **turbo** - 809M parameters, specialized for speed

## Production Deployment

For a production deployment:

1. Build the React frontend:
```bash
cd frontend
npm run build
```

2. Configure the Flask app to serve the static files from the build directory
3. Set up a production WSGI server like Gunicorn:
```bash
pip install gunicorn
gunicorn -w 4 app:app
```

4. Consider using a process manager like Supervisor or systemd
5. Set up Nginx as a reverse proxy

## Folder Structure

Below is an overview of the folder structure for the YouTube Video Transcriber project:

```
youtube-transcriber/
├── backend/
│   ├── app.py                 # Main Flask application
│   ├── config.json            # Configuration settings
│   ├── downloads/             # Downloaded audio files
│   ├── logs/                  # Application logs
│   ├── models/                # Downloaded model files
│   │   ├── whisper/           # OpenAI Whisper models
│   │   └── faster-whisper/    # Faster-Whisper models
│   ├── notes/                 # Generated notes storage
│   └── transcripts/           # Generated transcripts storage
└── frontend/
  ├── public/                # Static assets
  └── src/
    ├── assets/            # Images and icons
    │   └── icons8-cog.gif  # Settings icon
    ├── components/        # React components
    │   ├── Home.js        # Landing page component
    │   ├── Home.css       # Landing page styles
    │   ├── Navbar.js      # Navigation component
    │   ├── Navbar.css     # Navigation styles
    │   ├── TranscriptionView.js  # Transcript and video viewer
    │   ├── TranscriptionView.css # Transcript and video styles
    │   ├── JobsList.js    # Job history component
    │   └── JobsList.css   # Job history styles
    ├── App.js             # Main application component
    ├── App.css            # Main application styles
    ├── index.js           # Application entry point
    └── index.css          # Global styles
```

## Component Structure

### Frontend Components

1. **Home Component** - Landing page with URL input and model configuration
2. **Navbar Component** - Navigation bar with theme settings
3. **TranscriptionView Component** - Main view with video player and transcript
4. **JobsList Component** - Searchable

### Backend Components

1. **/api/transcribe:** POST request to transcribe a YouTube video
2. **/api/job/<job_id>:** GET request to retrieve job status and results
3. **/api/transcript/<job_id>:** GET request to retrieve transcript text
4. **/api/notes/<job_id>:** GET request to retrieve notes and summaries
5. **/api/jobs:** GET request to retrieve job history
6. **/api/config:** GET/POST request to retrieve/update model configuration
7. **/api/load_model:** POST request to load a specific model
8. **/api/logs/<job_id>:** GET request to retrieve job logs
9. **/api/save_theme:** POST request to save theme settings
10. **/api/regenerate_notes/<job_id>:** POST request to regenerate notes for a completed transcription
11. **/api/clear_model_config:** POST request to reset model configuration to defaults
12. **/api/auth/login:** POST request for user login
13. **/api/auth/signup:** POST request for new user registration
14. **/api/auth/logout:** POST request for user logout
15. **/api/auth/check:** GET request to check authentication status
16. **/api/export/notion:** POST request to export transcript and notes to Notion
17. **/api/jobs/<job_id>:** DELETE request to delete a job and its data

## Notion Integration

This app supports exporting transcripts and notes directly to Notion. There are two ways to set up the Notion integration:

### Environment Variables (Recommended)

1. Rename `.env.example` to `.env` in the root directory
2. Fill in your Notion integration token and parent page ID
3. Restart the application

### Manual Entry

You can also enter your Notion credentials manually when exporting if you prefer not to store them.

### Setting Up Notion Integration

1. Create a new Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Give your integration a name (e.g., "YouTube Transcriber")
3. Copy the "Internal Integration Token"
4. In Notion, create or select a parent page where you want new transcripts to be created
5. Share the parent page with your integration (click "Share" > select your integration)
6. Copy the page ID from the URL: notion.so/Page-Name-**pageId**

Now you can either:
- Add these credentials to your `.env` file, or
- Enter them manually when exporting

When you export to Notion, the app will create a new page with the video title and organize all content there.

## Demonstration Video
[YouTube Video Transcriber Demo](https://github.com/Leptons1618/YT_Transcriber/blob/master/YT_Transcriber_Demo.mkv)