# YouTube Video Transcriber - Documentation

A full-featured YouTube video transcription application with AI-powered notes and summaries.

## Features

- **Transcription of YouTube videos** using OpenAI's Whisper or Faster-Whisper
- **Synchronized video and transcript** - click on text to jump to that point in the video
- **AI-generated smart notes and summaries**
- **Advanced search capabilities**:
  - Full-text search within transcripts
  - Keyboard shortcuts (Enter to search, F3/Shift+F3 to navigate results, Esc to clear)
  - Result highlighting
- **Filtering and organization**:
  - Filter by status, date range
  - Sort alphabetically or by date
  - Search by title
- **Real-time transcription feedback** with animated updates
- **Multiple export formats** (PDF, TXT)
- **Responsive design** with dark/light mode support
- **Persistent theme settings**
- **Detailed model configuration** with size/performance options
- **Job history and status tracking**

## Prerequisites

- Python 3.8+ with pip
- Node.js 14+ with npm
- ffmpeg (required for audio processing)
- CUDA-compatible GPU recommended for faster processing

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
pip install flask flask-cors whisper faster-whisper yt-dlp transformers nltk torch
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
npm install react-router-dom jspdf
```

## Running the Application

1. Start the backend server:

```bash
cd ../backend
# Activate virtual environment if not already active
python app.py
```

2. In a separate terminal, start the frontend development server:

```bash
cd ../frontend
npm start
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
        │   └── icons8-cog.gif # Settings icon
        ├── components/
        │   ├── Home.js        # Landing page component
        │   ├── Home.css       # Landing page styles
        │   ├── Navbar.js      # Navigation component
        │   ├── Navbar.css     # Navigation styles
        │   ├── TranscriptionView.js # Transcript/video viewer
        │   ├── TranscriptionView.css # Transcript/video styles
        │   ├── JobsList.js    # Job history component
        │   └── JobsList.css   # Job history styles
        ├── App.js             # Main application component
        ├── App.css            # Main application styles
        ├── index.js           # Application entry point
        └── index.css          # Global styles

## Component Structure

### Frontend Components

1. **Home Component** - Landing page with URL input and model configuration
2. **Navbar Component** - Navigation bar with theme settings
3. **TranscriptionView Component** - Main view with video player and transcript
4. **JobsList Component** - Searchable

### Backend Components

1. **/api/transcribe:** POST request to transcribe a YouTube video
2. **/api/job/<job_id>:** GET request to retrieve job status and results
3. ...