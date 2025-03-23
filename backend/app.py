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
from modules.summarization import generate_notes

# Ensure required NLTK resources are available
ensure_nltk_resources()

# Initialize Flask app
app = Flask(__name__, static_folder='../frontend/build')
CORS(app)

# Remove the automatic model loading at startup
# def initialize_models():
#     """Initialize models at startup using saved configuration"""
#     ...
# 
# # Run initialization
# initialize_models()

# Instead, just load the configuration
logger.info("Loading application configuration")
app_config = load_app_config()
logger.info(f"Configuration loaded: {app_config}")

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
        "standard_summarizers": ["facebook/bart-large-cnn", "facebook/bart-large-xsum", "google/pegasus-xsum"],
        # Specialized models for specific languages
        "specialized_summarizers": {
            "hi": ["ai4bharat/IndicBART"],
            "bn": ["google/mt5-base"]
        }
    }
    
    return jsonify(config_data), 200

# New endpoint to check summarizer status
@app.route('/api/summarizer/status', methods=['GET'])
def check_summarizer_status():
    from config import summarizer
    
    status = {
        "available": summarizer is not None,
        "model_name": None,
        "details": {}
    }
    
    config_data = load_app_config()
    status["model_name"] = config_data.get("summarizer_model")
    
    if summarizer is not None:
        # Get model details if available
        try:
            model_info = summarizer.model.config.to_dict()
            status["details"] = {
                "model_type": model_info.get("model_type", "unknown"),
                "_name_or_path": model_info.get("_name_or_path", "unknown"),
                "device": str(next(summarizer.model.parameters()).device)
            }
        except Exception as e:
            status["details"] = {"error": f"Could not get model details: {str(e)}"}
    
    return jsonify(status)

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

@app.route('/api/regenerate_notes/<job_id>', methods=['POST'])
def regenerate_notes(job_id):
    """Regenerate notes from existing transcript with optional model selection"""
    try:
        from config import TRANSCRIPT_DIR, NOTES_DIR
        
        # Get request data for model selection
        data = request.json or {}
        model_name = data.get('model')
        
        # Check if transcript exists
        transcript_path = os.path.join(TRANSCRIPT_DIR, f"{job_id}.json")
        if not os.path.exists(transcript_path):
            return jsonify({"error": "Transcript not found"}), 404
            
        # Read the transcript
        with open(transcript_path, 'r') as f:
            transcript_data = json.load(f)
        
        # Get the full transcript text
        full_text = ""
        if "text" in transcript_data:
            # Use the full text if available
            full_text = transcript_data["text"]
        elif "segments" in transcript_data:
            # Otherwise concatenate the segments
            full_text = " ".join([segment.get("text", "") for segment in transcript_data.get("segments", [])])
        
        if not full_text:
            return jsonify({"error": "Empty transcript, cannot generate notes"}), 400
            
        # Regenerate the notes with optional model selection
        logger.info(f"Regenerating notes for job {job_id}" + (f" with model {model_name}" if model_name else ""))
        
        # Load the specified model if provided
        if model_name:
            success = load_summarizer(model_name)
            if not success:
                return jsonify({"error": f"Failed to load summarizer model {model_name}"}), 500
        
        # Generate notes with the loaded model
        notes = generate_notes(full_text)
        
        # Save the regenerated notes
        notes_path = os.path.join(NOTES_DIR, f"{job_id}.json")
        with open(notes_path, 'w') as f:
            json.dump(notes, f)
            
        # Set the notes path in active_jobs if job is still active
        if job_id in active_jobs:
            active_jobs[job_id]["notes_path"] = notes_path
        
        logger.info(f"Successfully regenerated notes for job {job_id}")
        return jsonify(notes)
        
    except Exception as e:
        logger.error(f"Error regenerating notes: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to regenerate notes: {str(e)}"}), 500

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