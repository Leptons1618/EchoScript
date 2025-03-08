# Backend: Flask application with transcription and summarization

# Standard Libraries
import json
import os
import threading
import time
import uuid

# Third-Party Libraries
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import nltk

# Import modules
from config import logger, active_jobs, transcription_logs, CONFIG_FILE
from modules.utils import ensure_nltk_resources
from modules.transcription import process_video
from modules.models import load_whisper_model, verify_faster_whisper_model, load_summarizer, save_app_config, load_app_config
from modules.notion import export_to_notion

# Ensure required NLTK resources are available
ensure_nltk_resources()

# Initialize Flask app
app = Flask(__name__, static_folder='../frontend/build')
CORS(app)

@app.route('/api/transcribe', methods=['POST'])
def transcribe_video():
    """API endpoint to start transcription of a YouTube video"""
    try:
        data = request.json
        youtube_url = data.get('youtube_url')  # Note that this might be 'url' in your code
        model_type = data.get('model_type', 'whisper')
        model_size = data.get('model_size', 'medium')
        language = data.get('language')  # Add language parameter
        
        # Improved validation for YouTube URLs
        import re
        youtube_pattern = re.compile(r'^(https?://)?(www\.)?(youtube\.com/(watch\?v=|v/|embed/|shorts/)|youtu\.be/)')
        if not youtube_url or not youtube_pattern.match(youtube_url):
            return jsonify({"error": "Invalid YouTube URL"}), 400
            
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        
        # Save job config including language
        active_jobs[job_id] = {
            "url": youtube_url,
            "status": "queued",
            "created_at": time.time(),
            "model_type": model_type,
            "model_size": model_size,
            "language": language  # Store language in job config
        }
        
        # Start processing in a separate thread
        thread = threading.Thread(target=process_video, args=(youtube_url, job_id, language))
        thread.daemon = True
        thread.start()
        
        logger.info(f"Started job {job_id} for URL: {youtube_url} with model: {model_type}/{model_size}, language: {language or 'auto'}")
        return jsonify({"job_id": job_id, "status": "queued"})
        
    except Exception as e:
        logger.error(f"Error starting transcription: {str(e)}")
        return jsonify({"error": "Failed to start transcription job"}), 500

@app.route('/api/load_model', methods=['POST'])
def load_model_config():
    data = request.json
    model_type = data.get('model_type', 'whisper')
    model_size = data.get('model_size', 'medium')
    summarizer_model = data.get('summarizer_model')
    
    # Save config
    save_app_config(model_type, model_size, summarizer_model)
    
    # Load summarization model
    load_summarizer(summarizer_model)
    
    # Continue with loading the appropriate transcription model
    if model_type == "whisper":
        load_whisper_model(model_size)
    elif model_type == "faster-whisper":
        verify_faster_whisper_model(model_size)
    else:
        return jsonify({"error": "Invalid model type"}), 400
    
    return jsonify({"message": f"{model_type.capitalize()} model {model_size} loaded with {summarizer_model} summarizer"}), 200

@app.route('/api/config', methods=['GET'])
def get_config():
    config_data = load_app_config()
    
    # Add available summarizers to the response
    from modules.models import get_available_summarizers
    config_data["available_summarizers"] = get_available_summarizers()
    
    # Add language support information
    config_data["language_support"] = {
        # Standard models support all languages but at varying quality
        "standard_summarizers": ["bart-large-cnn", "facebook/bart-large-xsum", "google/pegasus-xsum"],
        # Specialized models for specific languages
        "specialized_summarizers": {
            "hi": ["ai4bharat/IndicBART"],
            "bn": ["google/mt5-base"]
        }
    }
    
    return jsonify(config_data), 200

@app.route('/api/save_theme', methods=['POST'])
def save_theme():
    try:
        data = request.json
        theme = data.get('theme', 'light')
        
        # Read existing config
        config_data = load_app_config()
        
        # Save updated config with new theme
        save_app_config(
            config_data.get("model_type", "whisper"),
            config_data.get("model_size", "medium"),
            config_data.get("summarizer_model"),
            theme
        )
            
        return jsonify({"message": f"Theme set to {theme}"}), 200
    except Exception as e:
        logger.error(f"Error saving theme: {str(e)}")
        return jsonify({"error": f"Failed to save theme: {str(e)}"}), 500

@app.route('/api/job/<job_id>', methods=['GET'])
def get_job_status(job_id):
    from config import TRANSCRIPT_DIR, NOTES_DIR
    if job_id not in active_jobs:
        transcript_path = os.path.join(TRANSCRIPT_DIR, f"{job_id}.json")
        notes_path = os.path.join(NOTES_DIR, f"{job_id}.json")
        if os.path.exists(transcript_path):
            try:
                with open(transcript_path, 'r') as f:
                    data = json.load(f)
                title = data.get("title", "Unknown Video")
                channel = data.get("channel", "Unknown")
            except Exception:
                title = "Unknown Video"
                channel = "Unknown"
            job_info = {
                "job_id": job_id,
                "status": "complete",
                "transcript_path": transcript_path,
                "notes_path": notes_path,
                "title": title,
                "channel": channel,
                "created_at": os.path.getmtime(transcript_path)
            }
            return jsonify(job_info)
        else:
            return jsonify({"error": "Job not found"}), 404
    return jsonify(active_jobs[job_id])

@app.route('/api/transcript/<job_id>', methods=['GET'])
def get_transcript(job_id):
    from config import TRANSCRIPT_DIR
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
    from config import NOTES_DIR
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
    from config import TRANSCRIPT_DIR
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

@app.route('/api/logs/<job_id>', methods=['GET'])
def get_job_logs(job_id):
    if job_id in transcription_logs:
        return jsonify({"logs": transcription_logs[job_id]})
    return jsonify({"logs": []})

@app.route('/api/export/notion', methods=['POST'])
def notion_export():
    """Export transcript and notes to Notion by creating a new page"""
    data = request.json
    content = data.get('content')
    notion_token = data.get('notionToken')
    parent_page_id = data.get('notionPageId')
    
    result = export_to_notion(content, notion_token, parent_page_id)
    
    if result.get('success', False):
        return jsonify(result)
    else:
        return jsonify(result), 400

# Serve React frontend in production
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    logger.info("Starting Flask server on 0.0.0.0:5000")
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)