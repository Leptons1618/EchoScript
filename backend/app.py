# Backend: Flask application with transcription and summarization

# Standard Libraries
import datetime
import json
import logging
import os
import re
import threading
import time
import uuid

# Set CUDA memory allocation configuration before importing PyTorch
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# Third-Party Libraries
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import nltk
from nltk.tokenize import sent_tokenize
import torch
import whisper
import yt_dlp
from transformers import pipeline

# Add the Notion API client
# You'll need to install the Notion SDK first: pip install notion-client
from notion_client import Client
import json

# Add LOG_DIR configuration to save log files per session
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
log_filename = os.path.join(LOG_DIR, f"session_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.log")

# Set up logging to output to terminal and save logs in separate files per session
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_filename)
    ]
)
logger = logging.getLogger(__name__)

# Download required NLTK data for 'punkt' and 'punkt_tab'
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')
    logger.info("Downloaded NLTK resource: punkt")

try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt_tab')
    logger.info("Downloaded NLTK resource: punkt_tab")

app = Flask(__name__, static_folder='../frontend/build')
CORS(app)

# Configure storage paths
AUDIO_DIR = 'downloads'
TRANSCRIPT_DIR = 'transcripts'
NOTES_DIR = 'notes'
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

# Ensure directories exist
for directory in [AUDIO_DIR, TRANSCRIPT_DIR, NOTES_DIR, MODEL_DIR]:
    os.makedirs(directory, exist_ok=True)

transcription_model = None  # No model loaded on startup
current_whisper_model_size = None
summarizer = None   # Added global summarizer variable

# Track jobs
active_jobs = {}
jobs_lock = threading.Lock()

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")

# Create a dictionary to store real-time transcription logs
transcription_logs = {}

# Modify the append_transcription_log function to be more efficient
def append_transcription_log(job_id, text):
    if job_id not in transcription_logs:
        transcription_logs[job_id] = []
    
    # Add timestamp to logs for UI only (no terminal logging)
    timestamp = datetime.datetime.now().strftime('%H:%M:%S')
    log_entry = f"{timestamp} - {text}"
    transcription_logs[job_id].append(log_entry)
    
    # Keep only the latest 100 logs to prevent memory bloat
    if len(transcription_logs[job_id]) > 100:
        transcription_logs[job_id] = transcription_logs[job_id][-100:]
    
    # Don't log transcriptions to terminal as they're too verbose
    # Only log critical events to the terminal/logfile

@app.route('/api/transcribe', methods=['POST'])
def transcribe_video():
    data = request.json
    youtube_url = data.get('youtube_url')
    if not youtube_url:
        logger.warning("No YouTube URL provided")
        return jsonify({"error": "No YouTube URL provided"}), 400

    # Read additional config options
    model_type = data.get('model_type', 'whisper')
    model_size = data.get('model_size', 'medium')
    
    job_id = str(uuid.uuid4())
    logger.info(f"Job {job_id} created for URL: {youtube_url} using {model_type} ({model_size})")
    
    # Store config in job details
    active_jobs[job_id] = {
        "status": "downloading",
        "url": youtube_url,
        "created_at": time.time(),
        "model_type": model_type,
        "model_size": model_size
    }
    
    # Start processing in a new thread
    thread = threading.Thread(target=process_video, args=(youtube_url, job_id))
    thread.start()
    
    return jsonify({"job_id": job_id, "status": "processing"})

def process_video(youtube_url, job_id):
    try:
        with jobs_lock:
            if job_id not in active_jobs:
                active_jobs[job_id] = {"url": youtube_url, "created_at": time.time()}
            active_jobs[job_id]["status"] = "downloading"
        logger.info(f"Job {job_id}: Downloading audio...")
        
        audio_path = download_youtube_audio(youtube_url, job_id)
        
        with jobs_lock:
            active_jobs[job_id]["status"] = "transcribing"
            active_jobs[job_id]["audio_path"] = audio_path
        logger.info(f"Job {job_id}: Audio downloaded to {audio_path}. Transcribing...")
        
        # Retrieve configuration for model
        model_type = active_jobs[job_id].get("model_type", "whisper")
        model_size = active_jobs[job_id].get("model_size", "medium")
        
        # Transcribe audio based on selected model
        transcript, segments = transcribe_audio(audio_path, model_type, model_size)
        
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
            "channel": info.get('uploader', 'Unknown'),
            "youtube_url": youtube_url  # Save the YouTube URL
        }
        transcript_path = os.path.join(TRANSCRIPT_DIR, f"{job_id}.json")
        with open(transcript_path, 'w') as f:
            json.dump(transcript_data, f)
        logger.info(f"Job {job_id}: Transcript saved at {transcript_path}")
        
        with jobs_lock:
            active_jobs[job_id]["status"] = "generating_notes"
            active_jobs[job_id]["transcript_path"] = transcript_path
        
        # Generate and save notes (add title if needed)
        notes = generate_notes(transcript)
        notes["title"] = transcript_data["title"]
        notes_path = os.path.join(NOTES_DIR, f"{job_id}.json")
        with open(notes_path, 'w') as f:
            json.dump(notes, f)
        logger.info(f"Job {job_id}: Notes saved at {notes_path}")
        
        with jobs_lock:
            active_jobs[job_id]["status"] = "complete"
            active_jobs[job_id]["notes_path"] = notes_path
            active_jobs[job_id]["title"] = transcript_data["title"]
            active_jobs[job_id]["channel"] = transcript_data["channel"]
            active_jobs[job_id]["thumbnail"] = info.get('thumbnail', '')
        logger.info(f"Job {job_id}: Processing complete")
    
    except Exception as e:
        with jobs_lock:
            if job_id not in active_jobs:
                active_jobs[job_id] = {"url": youtube_url, "created_at": time.time()}
            active_jobs[job_id]["status"] = "error"
            active_jobs[job_id]["error"] = str(e)
        logger.error(f"Job {job_id}: Error occurred - {str(e)}", exc_info=True)

def download_youtube_audio(youtube_url, job_id):
    logger.info(f"Job {job_id}: Starting audio download using yt-dlp")
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
    logger.info(f"Job {job_id}: Audio downloaded successfully")
    return os.path.join(AUDIO_DIR, f"{job_id}.mp3")

def get_model_path(model_type):
    base = os.path.join(os.path.dirname(__file__), "models")
    path = os.path.join(base, model_type)
    os.makedirs(path, exist_ok=True)
    return path

# Fix transcribe_audio function for better performance
def transcribe_audio(audio_path, model_type="whisper", model_size="medium"):
    global transcription_model, current_whisper_model_size
    logger.info(f"Transcribing audio with {model_type} model ({model_size}) from {audio_path}")
    import os
    if not os.path.exists(audio_path):
        logger.error(f"Audio file not found: {audio_path}")
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    
    # Extract job_id and log the start of transcription immediately
    job_id = os.path.basename(audio_path).split('.')[0]
    append_transcription_log(job_id, "Transcription started...")
    
    # Get audio duration for progress reporting
    import subprocess
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 
             'default=noprint_wrappers=1:nokey=1', audio_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT
        )
        audio_duration = float(result.stdout)
        logger.info(f"Audio duration: {audio_duration:.2f} seconds")
    except Exception:
        audio_duration = 0
        logger.warning("Couldn't determine audio duration")

    if model_type == "faster-whisper":
        from faster_whisper import WhisperModel
        model_path = get_model_path("faster-whisper")
        
        # Initialize the model with optimized settings
        logger.info(f"Loading Faster-Whisper {model_size} model")
        try:
            # Optimize VRAM usage with compute_type and better options
            faster_model = WhisperModel(
                model_size, 
                device="cuda", 
                compute_type="float16", 
                download_root=model_path,
                cpu_threads=4,  # Use 4 CPU threads to help with preprocessing
                num_workers=2   # Use 2 workers for DataLoader
            )
            
            # Use efficient batched processing
            logger.info(f"Starting transcription for job {job_id}")
            segments = []
            segment_count = 0
            last_log_time = time.time()
            
            # Process segments with optimization options
            for segment in faster_model.transcribe(
                audio_path,
                beam_size=5,           # Beam size (quality vs speed tradeoff)
                vad_filter=True,       # Voice activity detection for better segment detection
                vad_parameters=dict(min_silence_duration_ms=500),  # Skip silences > 500ms
            )[0]:
                segment_count += 1
                segments.append(segment)
                
                # Format and log each segment but don't flood logs
                formatted_time = formatTime(segment.start)
                log_message = f"{formatted_time} - {segment.text}"
                append_transcription_log(job_id, log_message)
                
                # Report progress every 10 seconds
                current_time = time.time()
                if (current_time - last_log_time) > 10:
                    progress = min(100, int((segment.end / audio_duration * 100) if audio_duration else 0))
                    logger.info(f"Job {job_id}: Transcription progress ~{progress}% ({segment_count} segments)")
                    last_log_time = current_time
            
            logger.info(f"Job {job_id}: Transcription complete with {segment_count} segments")
            
            # Create optimized output
            transcript = " ".join([s.text for s in segments])
            formatted_segments = [{"text": s.text, "start": s.start, "end": s.end} for s in segments]
            return transcript, formatted_segments
        
        except Exception as e:
            logger.error(f"Error in transcription: {str(e)}")
            raise
    
    else:
        # For OpenAI Whisper model
        if transcription_model is None:
            errorMsg = "No Whisper model loaded. Please configure and load a model first."
            logger.error(errorMsg)
            raise Exception(errorMsg)
        
        # Start transcription
        logger.info(f"Starting OpenAI Whisper transcription for job {job_id}")
        append_transcription_log(job_id, "Starting OpenAI Whisper transcription...")
        
        try:
            # Use the already loaded model with optimized settings
            result = transcription_model.transcribe(
                audio_path,
                fp16=True,         # Use float16 for better performance
                beam_size=5,       # Beam search with 5 beams (quality vs speed tradeoff)
                best_of=5          # Return best of 5 candidates
            )
            
            # Log some segments for UI display without flooding logs
            total_segments = len(result["segments"])
            log_interval = max(1, total_segments // 20)  # log ~20 segments
            
            for i, segment in enumerate(result["segments"]):
                if i % log_interval == 0 or i == total_segments - 1:
                    formatted_time = formatTime(segment['start'])
                    log_message = f"{formatted_time} - {segment['text']}"
                    append_transcription_log(job_id, log_message)
            
            logger.info(f"Job {job_id}: Whisper transcription complete with {total_segments} segments")
            return result["text"], result["segments"]
            
        except Exception as e:
            logger.error(f"Error in Whisper transcription: {str(e)}")
            raise

# Helper function to format time
def formatTime(seconds):
    minutes = int(seconds / 60)
    secs = int(seconds % 60)
    return f"{minutes}:{secs:02d}"

# Optimize the notes generation for better performance
def generate_notes(transcript):
    logger.info("Generating notes from transcript")
    
    # Check if summarizer is available
    global summarizer
    if summarizer is None:
        logger.warning("Summarizer not available, returning basic summary")
        return {
            "summary": transcript[:1000] + "...",  # Basic truncation as fallback
            "key_points": ["No key points could be generated. Please try again."],
            "original_transcript": transcript
        }
    
    try:
        # Optimize for performance by creating smarter chunks
        sentences = sent_tokenize(transcript)
        chunks = []
        current_chunk = ""
        
        # Create chunks of roughly 900-1000 characters for summarization
        for sentence in sentences:
            if len(current_chunk) + len(sentence) < 900:
                current_chunk += " " + sentence
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        # Skip very short chunks and process in batches for efficiency
        valid_chunks = [chunk for chunk in chunks if len(chunk) >= 50]
        
        # Log information for debugging
        logger.info(f"Processing {len(valid_chunks)} chunks for summarization")
        if len(valid_chunks) == 0:
            logger.warning("No valid chunks found for summarization")
            return {
                "summary": transcript[:1000] + "...",
                "key_points": ["Transcript too short for key point extraction."],
                "original_transcript": transcript
            }
        
        # Process in small batches to avoid OOM errors
        batch_size = 2
        batched_chunks = [valid_chunks[i:i+batch_size] for i in range(0, len(valid_chunks), batch_size)]
        
        # Log batching information
        logger.info(f"Created {len(batched_chunks)} batches of size {batch_size}")
        
        all_summaries = []
        successful_batches = 0
        
        for batch_idx, batch in enumerate(batched_chunks):
            try:
                # Process each batch with optimized parameters
                logger.info(f"Processing batch {batch_idx+1}/{len(batched_chunks)}")
                summaries = summarizer(
                    batch, 
                    max_length=150,  # Increased max length
                    min_length=30,
                    do_sample=True,  # Enable sampling for variety
                    temperature=1.0,  # Add temperature for more diverse output
                    num_beams=4,      # Use beam search for better quality
                    truncation=True
                )
                all_summaries.extend([s['summary_text'] for s in summaries])
                successful_batches += 1
                
                # Log success message
                logger.info(f"Successfully processed batch {batch_idx+1}")
                
            except Exception as e:
                logger.error(f"Error in batch summarization for batch {batch_idx+1}: {str(e)}")
                # Skip failed batches
                continue
        
        if len(all_summaries) == 0:
            logger.error("No summaries were generated successfully")
            return {
                "summary": "Failed to generate a summary.",
                "key_points": ["Failed to extract key points from the transcript."],
                "original_transcript": transcript
            }
        
        logger.info(f"Generated {len(all_summaries)} summaries from {successful_batches} batches")
        
        # Improved key point extraction with better sentence parsing
        key_points = []
        for summary in all_summaries:
            # First try to find sentences that look like bullet points or key facts
            important_patterns = [
                r'(?:^|\n)(?:\d+\.\s|\*\s|\-\s)(.+?)(?=$|\n)',  # Numbered/bulleted points
                r'(?:Key|Important|Main)(?:\s+point|\s+takeaway|\s+idea|\s+concept|\s+fact)(?:s)?(?:\s+include|\s+is|\s+are)?(?:\s*:)?\s+(.+?)(?:$|\n|\.)',  # "Key point is..." patterns
                r'(?:First|Second|Third|Fourth|Fifth|Finally|Lastly)(?:\s*,)?\s+(.+?)(?:$|\n|\.)'  # Ordinal markers
            ]
            
            for pattern in important_patterns:
                matches = re.finditer(pattern, summary, re.IGNORECASE | re.MULTILINE)
                for match in matches:
                    if match.group(1).strip():
                        point = match.group(1).strip()
                        # Ensure the point ends with proper punctuation
                        if not point.endswith(('.', '!', '?')):
                            point += '.'
                        key_points.append(point)
            
            # If we haven't found at least 2 points with patterns, use regular sentence tokenization
            if len(key_points) < 2:
                points = sent_tokenize(summary)
                # Filter for longer, more informative sentences
                for point in points:
                    point = point.strip()
                    word_count = len(point.split())
                    # Only include points that are reasonably long but not too long
                    if 5 <= word_count <= 25 and len(point) >= 50:
                        key_points.append(point)
        
        # Deduplicate points with lower similarity threshold
        unique_points = []
        for point in key_points:
            if not any(similar(point, existing, threshold=0.7) for existing in unique_points):
                unique_points.append(point)
        
        logger.info(f"Generated {len(unique_points)} unique key points")
        
        # If we still don't have enough key points, extract sentences from the transcript
        if len(unique_points) < 3:
            logger.info("Not enough key points extracted, falling back to direct transcript extraction")
            # Extract some sentences directly from transcript
            important_sentences = extract_important_sentences(transcript)
            for sentence in important_sentences:
                if not any(similar(sentence, existing, threshold=0.7) for existing in unique_points):
                    unique_points.append(sentence)
        
        # If we still have no key points, add a default message
        if len(unique_points) == 0:
            unique_points = ["No key points could be automatically extracted from this transcript."]
        
        notes = {
            "summary": " ".join(all_summaries),
            "key_points": unique_points[:10],  # Limit to top 10 points
            "original_transcript": transcript
        }
        logger.info(f"Notes generation complete: {len(notes['key_points'])} key points")
        return notes
        
    except Exception as e:
        logger.error(f"Error in note generation: {str(e)}", exc_info=True)
        # Fallback
        return {
            "summary": transcript[:1000] + "...",
            "key_points": ["Could not generate key points due to an error."],
            "original_transcript": transcript
        }

# Helper function to extract important sentences directly from transcript
def extract_important_sentences(transcript):
    # Look for sentences that contain signal phrases that suggest importance
    important_markers = [
        "important", "significant", "key", "critical", "crucial", "essential",
        "main point", "highlight", "takeaway", "conclusion", "in summary",
        "to summarize", "noteworthy", "remember", "notably", "specifically"
    ]
    
    sentences = sent_tokenize(transcript)
    important_sentences = []
    
    for sentence in sentences:
        lower_sentence = sentence.lower()
        
        # Check if the sentence contains any important markers
        if any(marker in lower_sentence for marker in important_markers):
            important_sentences.append(sentence)
            
        # Also include sentences that are within a good information density range
        # (not too short, not too verbose)
        elif 100 <= len(sentence) <= 200 and len(sentence.split()) >= 10:
            important_sentences.append(sentence)
    
    # Limit to 5 sentences to avoid overwhelming the key points section
    return important_sentences[:5]

# Helper function to check if two strings are very similar - adjusted threshold
def similar(str1, str2, threshold=0.7):  # Reduced threshold from 0.8 to 0.7
    # First check: if lengths are very different, they're not similar
    if abs(len(str1) - len(str2)) / max(len(str1), len(str2)) > (1 - threshold):
        return False
    
    # Improved similarity check using word-based comparison instead of character-based
    words1 = set(str1.lower().split())
    words2 = set(str2.lower().split())
    
    # Calculate Jaccard similarity
    intersection = len(words1.intersection(words2))
    union = len(words1.union(words2))
    
    if union == 0:  # Edge case
        return False
        
    similarity = intersection / union
    return similarity > threshold

# Add support for multiple summarizer models with variable weight sizes
SUMMARIZER_MODELS = {
    "bart-large-cnn": {"name": "facebook/bart-large-cnn", "size": "1.6GB", "description": "High quality but requires more memory"},
    "bart-base-cnn": {"name": "sshleifer/distilbart-cnn-6-6", "size": "680MB", "description": "Good balance of quality and speed"},
    "t5-small": {"name": "t5-small", "size": "300MB", "description": "Fast but less detailed summaries"},
    "flan-t5-small": {"name": "google/flan-t5-small", "size": "300MB", "description": "Improved small model with instruction tuning"},
    "distilbart-xsum": {"name": "sshleifer/distilbart-xsum-12-1", "size": "400MB", "description": "Efficient model focused on extreme summarization"}
}

# Global variable to store current summarizer model name
current_summarizer_model = "bart-large-cnn"
summarizer = None   # Will store the loaded summarizer model

def load_summarizer(model_name=None):
    """Load summarizer model with fallback options if primary model fails"""
    global summarizer, current_summarizer_model
    
    # Use specified model or current model
    model_name = model_name or current_summarizer_model
    current_summarizer_model = model_name  # Update current model name
    
    logger.info(f"Loading summarization model: {model_name}")
    
    if model_name not in SUMMARIZER_MODELS:
        logger.error(f"Unknown summarizer model: {model_name}, fallback to bart-base-cnn")
        model_name = "bart-base-cnn"
    
    try:
        # Try loading on GPU first with half precision
        if torch.cuda.is_available():
            logger.info("Attempting to load summarizer on GPU with half precision")
            summarizer = pipeline(
                "summarization", 
                model=SUMMARIZER_MODELS[model_name]["name"],
                device=0,
                torch_dtype=torch.float16
            )
            logger.info(f"Summarization model {model_name} loaded successfully on GPU")
            return True
        else:
            # CPU fallback
            logger.info("GPU not available, loading summarizer on CPU")
            summarizer = pipeline(
                "summarization", 
                model=SUMMARIZER_MODELS[model_name]["name"],
                device=-1
            )
            logger.info(f"Summarization model {model_name} loaded successfully on CPU")
            return True
    except Exception as e:
        logger.error(f"Error loading primary summarizer model: {str(e)}")
        
        # Try fallback models if primary fails
        fallback_models = ["bart-base-cnn", "t5-small", "flan-t5-small", "distilbart-xsum"]
        for fallback_model in fallback_models:
            if fallback_model == model_name:
                continue  # Skip if this is the one that just failed
                
            try:
                logger.info(f"Trying fallback summarizer model: {fallback_model}")
                summarizer = pipeline(
                    "summarization", 
                    model=SUMMARIZER_MODELS[fallback_model]["name"],
                    device=-1  # Use CPU for fallback to be safe
                )
                logger.info(f"Fallback summarizer {fallback_model} loaded successfully")
                current_summarizer_model = fallback_model
                return True
            except Exception as ex:
                logger.error(f"Error loading fallback summarizer {fallback_model}: {str(ex)}")
        
        # If all models fail
        logger.error("All summarization models failed to load")
        summarizer = None
        return False

@app.route('/api/load_model', methods=['POST'])
def load_model_config():
    data = request.json
    model_type = data.get('model_type', 'whisper')
    model_size = data.get('model_size', 'medium')
    summarizer_model = data.get('summarizer_model', current_summarizer_model)
    
    # Save config first before PyTorch operations
    with open(CONFIG_FILE, 'w') as f:
        json.dump({
            "model_type": model_type, 
            "model_size": model_size, 
            "summarizer_model": summarizer_model
        }, f)
    
    global transcription_model, current_whisper_model_size
    
    # Load summarization model
    load_summarizer(summarizer_model)
    
    # Continue with loading the appropriate transcription model
    if model_type == "whisper":
        # Clear GPU memory before loading new model
        if 'transcription_model' in globals() and transcription_model is not None:
            logger.info("Unloading previous Whisper model")
            del transcription_model
            import gc; gc.collect()
            import torch
            torch.cuda.empty_cache()
            time.sleep(1)  # Allow GPU memory to release
        
        logger.info(f"Loading Whisper {model_size} model")
        model_path = get_model_path("whisper")
        
        # Load with optimized settings
        transcription_model = whisper.load_model(
            model_size, 
            download_root=model_path,
            device="cuda" if torch.cuda.is_available() else "cpu"
        )
        current_whisper_model_size = model_size
        logger.info(f"Completed loading Whisper {model_size} model")
        
    elif model_type == "faster-whisper":
        from faster_whisper import WhisperModel
        model_path = get_model_path("faster-whisper")
        logger.info(f"Loading Faster-Whisper {model_size} model")
        
        # We'll load the model on demand to save memory
        # Just verify the model can be downloaded/accessed
        _ = WhisperModel(
            model_size, 
            device="cuda", 
            compute_type="float16", 
            download_root=model_path,
            cpu_threads=4
        )
        logger.info(f"Verified Faster-Whisper {model_size} model")
    else:
        return jsonify({"error": "Invalid model type"}), 400
    
    return jsonify({"message": f"{model_type.capitalize()} model {model_size} loaded with {summarizer_model} summarizer"}), 200

@app.route('/api/config', methods=['GET'])
def get_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
    else:
        config = {
            "model_type": "whisper", 
            "model_size": "medium", 
            "theme": "light",
            "summarizer_model": "bart-large-cnn"
        }
    
    # Add model_status to indicate whether models are loaded
    config["model_status"] = "loaded" if transcription_model is not None else "no model loaded"
    config["summarizer_status"] = "loaded" if summarizer is not None else "no summarizer loaded"
    
    # Add available summarizer models to the config
    config["available_summarizers"] = SUMMARIZER_MODELS
    
    # Add current summarizer model
    config["summarizer_model"] = current_summarizer_model
    
    return jsonify(config), 200

# Add a new endpoint to save theme preference
@app.route('/api/save_theme', methods=['POST'])
def save_theme():
    try:
        data = request.json
        theme = data.get('theme', 'light')
        
        # Read existing config
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
        else:
            config = {"model_type": "whisper", "model_size": "medium"}
        
        # Update theme
        config["theme"] = theme
        
        # Save updated config
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f)
            
        return jsonify({"message": f"Theme set to {theme}"}), 200
    except Exception as e:
        logger.error(f"Error saving theme: {str(e)}")
        return jsonify({"error": f"Failed to save theme: {str(e)}"}), 500

@app.route('/api/job/<job_id>', methods=['GET'])
def get_job_status(job_id):
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

# Add a new API endpoint to get the logs
@app.route('/api/logs/<job_id>', methods=['GET'])
def get_job_logs(job_id):
    if job_id in transcription_logs:
        return jsonify({"logs": transcription_logs[job_id]})
    return jsonify({"logs": []})

@app.route('/api/export/notion', methods=['POST'])
def export_to_notion():
    """Export transcript and notes to Notion by creating a new page"""
    try:
        data = request.json
        content = data.get('content')
        
        # Get API key either from request or environment variable
        notion_token = data.get('notionToken') or os.getenv('NOTION_API_KEY')
        
        # Get parent page ID either from request or environment variable
        parent_page_id = data.get('notionPageId') or os.getenv('NOTION_PARENT_PAGE_ID')
        
        if not notion_token or not parent_page_id or not content:
            return jsonify({'error': 'Missing required parameters. Please provide Notion token and page ID or set them in environment variables.'}), 400
        
        # Initialize Notion client
        notion = Client(auth=notion_token)
        
        try:
            # Create a new page with the transcript title
            page_title = content.get('title', 'YouTube Video Transcript')
            
            # Create a new page in the parent database/page
            new_page = notion.pages.create(
                parent={"page_id": parent_page_id},
                properties={
                    "title": {
                        "title": [
                            {
                                "text": {
                                    "content": page_title
                                }
                            }
                        ]
                    }
                }
            )
            
            # Get the ID of the newly created page
            new_page_id = new_page["id"]
            
            # Format content for Notion blocks
            blocks = []
            
            # Add metadata (URL, channel)
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [
                        {"type": "text", "text": {"content": "Channel: "}},
                        {"type": "text", "text": {"content": content['channel']}, "annotations": {"bold": True}}
                    ]
                }
            })
            
            if content.get('url'):
                blocks.append({
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [
                            {"type": "text", "text": {"content": "URL: "}},
                            {"type": "text", "text": {"content": content['url']}, "annotations": {"underline": True}, "href": content['url']}
                        ]
                    }
                })
            
            # Add divider
            blocks.append({"object": "block", "type": "divider", "divider": {}})
            
            # Add summary section if available
            if content.get('summary'):
                blocks.append({
                    "object": "block",
                    "type": "heading_2",
                    "heading_2": {
                        "rich_text": [{"type": "text", "text": {"content": "Summary"}}]
                    }
                })
                
                blocks.append({
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{"type": "text", "text": {"content": content['summary']}}]
                    }
                })
                
                # Add divider
                blocks.append({"object": "block", "type": "divider", "divider": {}})
            
            # Add key points if available
            if content.get('keyPoints') and len(content['keyPoints']) > 0:
                blocks.append({
                    "object": "block",
                    "type": "heading_2",
                    "heading_2": {
                        "rich_text": [{"type": "text", "text": {"content": "Key Points"}}]
                    }
                })
                
                # Add bullet list for key points
                for point in content['keyPoints']:
                    blocks.append({
                        "object": "block",
                        "type": "bulleted_list_item",
                        "bulleted_list_item": {
                            "rich_text": [{"type": "text", "text": {"content": point}}]
                        }
                    })
                
                # Add divider
                blocks.append({"object": "block", "type": "divider", "divider": {}})
            
            # Add transcript if available
            if content.get('transcript') and len(content['transcript']) > 0:
                blocks.append({
                    "object": "block",
                    "type": "heading_2",
                    "heading_2": {
                        "rich_text": [{"type": "text", "text": {"content": "Transcript"}}]
                    }
                })
                
                # Add segments with timestamps
                for segment in content['transcript']:
                    blocks.append({
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [
                                {"type": "text", "text": {"content": f"[{segment['time']}] "}, "annotations": {"bold": True}},
                                {"type": "text", "text": {"content": segment['text']}}
                            ]
                        }
                    })
            
            # Execute the update to Notion by adding blocks to the new page
            response = notion.blocks.children.append(
                block_id=new_page_id,
                children=blocks
            )
            
            # Get the URL of the newly created page to return to the user
            page_url = f"https://notion.so/{new_page_id.replace('-', '')}"
            
            return jsonify({
                'success': True, 
                'message': 'Successfully exported to Notion',
                'pageId': new_page_id,
                'pageUrl': page_url
            })
        
        except Exception as e:
            logger.error(f"Notion API error: {str(e)}")
            return jsonify({'error': f'Notion API error: {str(e)}'}), 500
    
    except Exception as e:
        logger.error(f"Export to Notion error: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

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