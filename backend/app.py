# Backend: Flask application with transcription and summarization

# app.py
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import yt_dlp
import whisper
import os
import json
import uuid
import time
from transformers import pipeline
from nltk.tokenize import sent_tokenize
import nltk
import threading

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

app = Flask(__name__, static_folder='../frontend/build')
CORS(app)

# Configure storage paths
AUDIO_DIR = 'downloads'
TRANSCRIPT_DIR = 'transcripts'
NOTES_DIR = 'notes'

# Ensure directories exist
for directory in [AUDIO_DIR, TRANSCRIPT_DIR, NOTES_DIR]:
    os.makedirs(directory, exist_ok=True)

# Load Whisper model once at startup - using medium for balance of accuracy and speed
print("Loading Whisper model...")
transcription_model = whisper.load_model("medium")
print("Whisper model loaded")

# Load summarization model
print("Loading summarization model...")
summarizer = pipeline("summarization", model="facebook/bart-large-cnn")
print("Summarization model loaded")

# Track jobs
active_jobs = {}
jobs_lock = threading.Lock()

@app.route('/api/transcribe', methods=['POST'])
def transcribe_video():
    data = request.json
    youtube_url = data.get('youtube_url')
    if not youtube_url:
        return jsonify({"error": "No YouTube URL provided"}), 400
    
    job_id = str(uuid.uuid4())
    
    # Start processing in a new thread
    thread = threading.Thread(target=process_video, args=(youtube_url, job_id))
    thread.start()
    
    active_jobs[job_id] = {
        "status": "downloading",
        "url": youtube_url,
        "created_at": time.time()
    }
    
    return jsonify({"job_id": job_id, "status": "processing"})

def process_video(youtube_url, job_id):
    try:
        with jobs_lock:
            if job_id not in active_jobs:
                active_jobs[job_id] = {"url": youtube_url, "created_at": time.time()}
            active_jobs[job_id]["status"] = "downloading"
        
        # Download audio
        audio_path = download_youtube_audio(youtube_url, job_id)
        
        with jobs_lock:
            active_jobs[job_id]["status"] = "transcribing"
            active_jobs[job_id]["audio_path"] = audio_path
        
        # Transcribe audio
        transcript, segments = transcribe_audio(audio_path)
        
        # Get video metadata BEFORE saving transcript
        ydl_opts = {
            'quiet': True,
            'no_warnings': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
        
        # Save transcript including title and channel
        transcript_data = {
            "text": transcript,
            "segments": segments,
            "title": info.get('title', 'Unknown'),
            "channel": info.get('uploader', 'Unknown')
        }
        transcript_path = os.path.join(TRANSCRIPT_DIR, f"{job_id}.json")
        with open(transcript_path, 'w') as f:
            json.dump(transcript_data, f)
        
        with jobs_lock:
            active_jobs[job_id]["status"] = "generating_notes"
            active_jobs[job_id]["transcript_path"] = transcript_path
        
        # Generate and save notes (add title if needed)
        notes = generate_notes(transcript)
        notes["title"] = transcript_data["title"]
        notes_path = os.path.join(NOTES_DIR, f"{job_id}.json")
        with open(notes_path, 'w') as f:
            json.dump(notes, f)
        
        with jobs_lock:
            active_jobs[job_id]["status"] = "complete"
            active_jobs[job_id]["notes_path"] = notes_path
            active_jobs[job_id]["title"] = transcript_data["title"]
            active_jobs[job_id]["channel"] = transcript_data["channel"]
            active_jobs[job_id]["thumbnail"] = info.get('thumbnail', '')
    
    except Exception as e:
        with jobs_lock:
            if job_id not in active_jobs:
                active_jobs[job_id] = {"url": youtube_url, "created_at": time.time()}
            active_jobs[job_id]["status"] = "error"
            active_jobs[job_id]["error"] = str(e)

def download_youtube_audio(youtube_url, job_id):
    """Download YouTube video audio using yt-dlp"""
    output_template = os.path.join(AUDIO_DIR, f"{job_id}.%(ext)s")
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([youtube_url])
    
    return os.path.join(AUDIO_DIR, f"{job_id}.mp3")

def transcribe_audio(audio_path):
    """Transcribe audio using Whisper"""
    import os
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    result = transcription_model.transcribe(audio_path)
    return result["text"], result["segments"]

def generate_notes(transcript):
    """Generate notes from the transcript"""
    # Split into chunks to process with BART
    sentences = sent_tokenize(transcript)
    chunks = []
    current_chunk = ""
    
    # Create chunks of roughly 1000 characters for summarization
    for sentence in sentences:
        if len(current_chunk) + len(sentence) < 1000:
            current_chunk += " " + sentence
        else:
            chunks.append(current_chunk.strip())
            current_chunk = sentence
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    # Process each chunk
    summaries = []
    for chunk in chunks:
        if len(chunk) < 50:  # Skip very short chunks
            continue
        
        # Generate summary
        summary = summarizer(chunk, max_length=100, min_length=30, do_sample=False)
        summaries.append(summary[0]['summary_text'])
    
    # Extract key points
    key_points = []
    for summary in summaries:
        points = sent_tokenize(summary)
        key_points.extend(points)
    
    # Create structured notes
    notes = {
        "summary": " ".join(summaries),
        "key_points": key_points,
        "original_transcript": transcript
    }
    
    return notes

@app.route('/api/job/<job_id>', methods=['GET'])
def get_job_status(job_id):
    if job_id not in active_jobs:
        # Check if job info exists from a previous run via the transcript file
        transcript_path = os.path.join(TRANSCRIPT_DIR, f"{job_id}.json")
        notes_path = os.path.join(NOTES_DIR, f"{job_id}.json")
        if os.path.exists(transcript_path):
            job_info = {
                "job_id": job_id,
                "status": "complete",
                "transcript_path": transcript_path,
                "notes_path": notes_path,
                "title": "Unknown Video",
                "channel": "Unknown",
                "created_at": os.path.getmtime(transcript_path)
            }
            return jsonify(job_info)
        else:
            return jsonify({"error": "Job not found"}), 404
    return jsonify(active_jobs[job_id])

@app.route('/api/transcript/<job_id>', methods=['GET'])
def get_transcript(job_id):
    transcript_path = None
    if job_id in active_jobs and active_jobs[job_id].get("status") == "complete":
        transcript_path = active_jobs[job_id].get("transcript_path")
    else:
        possible_path = os.path.join(TRANSCRIPT_DIR, f"{job_id}.json")
        if os.path.exists(possible_path):
            transcript_path = possible_path
    if transcript_path is None:
        return jsonify({"error": "Transcript not available"}), 404
    with open(transcript_path, 'r') as f:
        transcript_data = json.load(f)
    return jsonify(transcript_data)

@app.route('/api/notes/<job_id>', methods=['GET'])
def get_notes(job_id):
    notes_path = None
    if job_id in active_jobs and active_jobs[job_id].get("status") == "complete":
        notes_path = active_jobs[job_id].get("notes_path")
    else:
        possible_path = os.path.join(NOTES_DIR, f"{job_id}.json")
        if os.path.exists(possible_path):
            notes_path = possible_path
    if notes_path is None:
        return jsonify({"error": "Notes not available"}), 404
    with open(notes_path, 'r') as f:
        notes_data = json.load(f)
    return jsonify(notes_data)

@app.route('/api/jobs', methods=['GET'])
def list_jobs():
    # Include in-progress jobs from memory
    job_list = [{
        "job_id": job_id,
        "status": job.get("status", "unknown"),
        "url": job.get("url", ""),
        "title": job.get("title", "Unknown"),
        "created_at": job.get("created_at", 0)
    } for job_id, job in active_jobs.items()]
    
    # Scan transcripts folder for saved transcripts from previous runs
    for filename in os.listdir(TRANSCRIPT_DIR):
        if filename.endswith(".json"):
            j_id = filename[:-5]
            if j_id not in active_jobs:
                transcript_path = os.path.join(TRANSCRIPT_DIR, filename)
                created_at = os.path.getmtime(transcript_path)
                title = "Unknown Video"
                try:
                    with open(transcript_path, 'r') as f:
                        data = json.load(f)
                        if "title" in data:
                            title = data["title"]
                except Exception:
                    pass
                job_list.append({
                    "job_id": j_id,
                    "status": "complete",
                    "url": "",
                    "title": title,
                    "created_at": created_at
                })
    
    job_list.sort(key=lambda x: x["created_at"], reverse=True)
    return jsonify({"jobs": job_list})

# Serve React frontend in production
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)