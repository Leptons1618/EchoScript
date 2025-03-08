import torch
import whisper
import gc
import time
import os
import json
from transformers import pipeline
from config import logger, SUMMARIZER_MODELS, MODEL_DIR, CONFIG_FILE
import config
from modules.utils import get_model_path

def load_whisper_model(model_size="medium"):
    """Load the OpenAI Whisper model"""
    # Clear GPU memory before loading new model
    if config.transcription_model is not None:
        logger.info("Unloading previous Whisper model")
        del config.transcription_model
        gc.collect()
        torch.cuda.empty_cache()
        time.sleep(1)  # Allow GPU memory to release
    
    logger.info(f"Loading Whisper {model_size} model")
    model_path = get_model_path("whisper")
    
    # Load with optimized settings
    config.transcription_model = whisper.load_model(
        model_size, 
        download_root=model_path,
        device="cuda" if torch.cuda.is_available() else "cpu"
    )
    config.current_whisper_model_size = model_size
    logger.info(f"Completed loading Whisper {model_size} model")
    return True

def verify_faster_whisper_model(model_size="medium"):
    """Verify that a Faster-Whisper model can be loaded"""
    try:
        from faster_whisper import WhisperModel
        model_path = get_model_path("faster-whisper")
        logger.info(f"Verifying Faster-Whisper {model_size} model")
        
        # Just verify the model can be accessed
        _ = WhisperModel(
            model_size, 
            device="cuda", 
            compute_type="float16", 
            download_root=model_path,
            cpu_threads=4
        )
        logger.info(f"Verified Faster-Whisper {model_size} model")
        return True
    except Exception as e:
        logger.error(f"Error verifying Faster-Whisper model: {str(e)}")
        return False

def load_summarizer(model_name=None):
    """Load summarizer model with fallback options if primary model fails"""
    model_name = model_name or config.current_summarizer_model
    config.current_summarizer_model = model_name
    
    logger.info(f"Loading summarization model: {model_name}")
    
    if model_name not in SUMMARIZER_MODELS:
        logger.error(f"Unknown summarizer model: {model_name}, fallback to bart-base-cnn")
        model_name = "bart-base-cnn"
    
    try:
        # Try loading on GPU first with half precision
        if torch.cuda.is_available():
            logger.info("Attempting to load summarizer on GPU with half precision")
            config.summarizer = pipeline(
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
            config.summarizer = pipeline(
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
                config.summarizer = pipeline(
                    "summarization", 
                    model=SUMMARIZER_MODELS[fallback_model]["name"],
                    device=-1  # Use CPU for fallback to be safe
                )
                logger.info(f"Fallback summarizer {fallback_model} loaded successfully")
                config.current_summarizer_model = fallback_model
                return True
            except Exception as ex:
                logger.error(f"Error loading fallback summarizer {fallback_model}: {str(ex)}")
        
        # If all models fail
        logger.error("All summarization models failed to load")
        config.summarizer = None
        return False

def save_app_config(model_type="whisper", model_size="medium", summarizer_model=None, theme="light"):
    """Save application configuration to config file"""
    summarizer_model = summarizer_model or config.current_summarizer_model
    
    config_data = {
        "model_type": model_type,
        "model_size": model_size,
        "summarizer_model": summarizer_model,
        "theme": theme
    }
    
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config_data, f)
    
    logger.info(f"Configuration saved: {config_data}")
    return config_data

def load_app_config():
    """Load application configuration from config file"""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config_data = json.load(f)
    else:
        config_data = {
            "model_type": "whisper",
            "model_size": "medium",
            "theme": "light",
            "summarizer_model": "bart-large-cnn"
        }
    
    # Add model_status to indicate whether models are loaded
    config_data["model_status"] = "loaded" if config.transcription_model is not None else "no model loaded"
    config_data["summarizer_status"] = "loaded" if config.summarizer is not None else "no summarizer loaded"
    
    # Add available summarizer models to the config
    config_data["available_summarizers"] = SUMMARIZER_MODELS
    
    # Add current summarizer model
    config_data["summarizer_model"] = config.current_summarizer_model
    
    return config_data
