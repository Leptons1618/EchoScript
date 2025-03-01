# YouTube Video Transcriber - Setup Guide

This project consists of a Flask backend for transcription processing and a React frontend for the user interface.

## Prerequisites

- Python 3.8+ with pip
- Node.js 14+ with npm
- ffmpeg (required for audio processing)

## Backend Setup

1. Create a project directory and set up a Python virtual environment:

```bash
mkdir youtube-transcriber
cd youtube-transcriber
mkdir backend
cd backend
python -m venv venv

# Activate the virtual environment
# On Windows
venv\Scripts\activate
# On macOS/Linux
source venv/bin/activate
```

2. Create the necessary files:

- Copy the backend code to `app.py`
- Create a `requirements.txt` file with the dependencies

3. Install the requirements:

```bash
pip install -r requirements.txt
```

4. Install ffmpeg (if not already installed):

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

2. Create the component structure:

```bash
mkdir -p src/components
```

3. Copy the provided component files to their respective locations:
   - `src/App.js`
   - `src/App.css`
   - `src/components/Home.js`
   - `src/components/Home.css`
   - `src/components/Navbar.js`
   - `src/components/Navbar.css`
   - `src/components/TranscriptionView.js`
   - `src/components/TranscriptionView.css`
   - `src/components/JobsList.js`
   - `src/components/JobsList.css`
   - `src/index.js`
   - `src/index.css`

4. Install additional dependencies:

```bash
npm install react-router-dom
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

- **Backend**: Flask server with the following components:
  - YouTube audio downloader (yt-dlp)
  - Whisper model for transcription
  - BART model for summarization and note generation
  - API endpoints for job management and data retrieval

- **Frontend**: React application with:
  - Modern, responsive UI
  - Real-time job status updates
  - Tabbed view for transcript and notes
  - Job history tracking

## Production Deployment

For a production deployment, you would need to:

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

## Features

- Transcription of YouTube videos
- Time-stamped transcript segments
- AI-generated notes and summaries
- Key points extraction
- Job history and status tracking
- Modern, responsive UI

## Limitations & Potential Improvements

- Currently, the application does not have user authentication
- Export functionality is not fully implemented
- Could add more advanced filtering and search capabilities
- Video embedding and synchronized transcript scrolling would enhance user experience
- For large-scale deployment, consider using a task queue like Celery