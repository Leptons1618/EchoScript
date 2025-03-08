import os
import logging
import datetime

# Base paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")

# Storage paths
AUDIO_DIR = os.path.join(BACKEND_DIR, 'downloads')
TRANSCRIPT_DIR = os.path.join(BACKEND_DIR, 'transcripts')
NOTES_DIR = os.path.join(BACKEND_DIR, 'notes')
MODEL_DIR = os.path.join(BACKEND_DIR, "models")
LOG_DIR = os.path.join(BACKEND_DIR, "logs")

# Ensure directories exist
for directory in [AUDIO_DIR, TRANSCRIPT_DIR, NOTES_DIR, MODEL_DIR, LOG_DIR]:
    os.makedirs(directory, exist_ok=True)

# Config file path
CONFIG_FILE = os.path.join(BACKEND_DIR, "config.json")

# Set CUDA memory allocation configuration
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "max_split_size_mb:512"
# Also set this environment variable to avoid CUDA memory allocation issues
os.environ["TRANSFORMERS_OFFLINE"] = "0"  # Allow downloading if needed
os.environ["TOKENIZERS_PARALLELISM"] = "false"  # Avoid parallelism warnings

# Logging configuration
log_filename = os.path.join(LOG_DIR, f"session_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_filename)
    ]
)
logger = logging.getLogger(__name__)

# Dictionary to store real-time transcription logs
transcription_logs = {}

# Track jobs
active_jobs = {}

# Summarizer model definitions
SUMMARIZER_MODELS = {
    "bart-large-cnn": {"name": "facebook/bart-large-cnn", "size": "1.6GB", "description": "High quality but requires more memory"},
    "bart-base-cnn": {"name": "sshleifer/distilbart-cnn-6-6", "size": "680MB", "description": "Good balance of quality and speed"},
    "t5-small": {"name": "t5-small", "size": "300MB", "description": "Fast but less detailed summaries"},
    "flan-t5-small": {"name": "google/flan-t5-small", "size": "300MB", "description": "Improved small model with instruction tuning"},
    "distilbart-xsum": {"name": "sshleifer/distilbart-xsum-12-1", "size": "400MB", "description": "Efficient model focused on extreme summarization"}
}

# Global model variables
transcription_model = None
current_whisper_model_size = None
summarizer = None
current_summarizer_model = "bart-large-cnn"
