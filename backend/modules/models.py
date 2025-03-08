import torch
import whisper
import gc
import time
import os
import json
import traceback
from transformers import pipeline, AutoModelForSeq2SeqLM, AutoTokenizer
from config import logger, SUMMARIZER_MODELS, MODEL_DIR, CONFIG_FILE
import config
from modules.utils import get_model_path

# Set CUDA memory allocation configuration - update the existing setting
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "max_split_size_mb:512"

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
    
    # Check if the model is already loaded with the same name
    if config.summarizer is not None:
        try:
            current_model = getattr(config.summarizer.model.config, "_name_or_path", "")
            if current_model and model_name in current_model:
                logger.info(f"Summarizer already loaded with model {current_model}")
                return True
            else:
                logger.info(f"Unloading current summarizer model {current_model} to load {model_name}")
                del config.summarizer
                config.summarizer = None
                # Force garbage collection to free up memory
                gc.collect()
                torch.cuda.empty_cache() if torch.cuda.is_available() else None
                time.sleep(0.5)  # Give some time for memory to be released
        except Exception as e:
            logger.warning(f"Error checking current summarizer model: {str(e)}")
            config.summarizer = None
            gc.collect()
    
    if model_name not in SUMMARIZER_MODELS:
        logger.error(f"Unknown summarizer model: {model_name}, fallback to bart-base-cnn")
        model_name = "bart-base-cnn"
    
    try:
        # Check available memory before loading
        if torch.cuda.is_available():
            free_memory = torch.cuda.get_device_properties(0).total_memory - torch.cuda.memory_allocated(0)
            logger.info(f"Free GPU memory before loading summarizer: {free_memory / 1024**2:.2f} MB")
        
        # Try loading on GPU first with half precision
        if torch.cuda.is_available():
            logger.info("Attempting to load summarizer on GPU with half precision")
            try:
                # First try with proper meta tensor handling for GPU
                from transformers import AutoConfig
                
                # First, load the config to check model architecture
                logger.info(f"Loading config for {SUMMARIZER_MODELS[model_name]['name']}")
                model_config = AutoConfig.from_pretrained(SUMMARIZER_MODELS[model_name]["name"])
                
                # Load tokenizer first
                logger.info(f"Loading tokenizer for {SUMMARIZER_MODELS[model_name]['name']}")
                tokenizer = AutoTokenizer.from_pretrained(SUMMARIZER_MODELS[model_name]["name"])
                
                # Load model properly with meta tensor handling
                logger.info(f"Loading model with meta tensor handling for {SUMMARIZER_MODELS[model_name]['name']}")
                
                # Use a different pattern to load the model safely on GPU
                model = AutoModelForSeq2SeqLM.from_pretrained(
                    SUMMARIZER_MODELS[model_name]["name"],
                    config=model_config,
                    torch_dtype=torch.float16,
                    low_cpu_mem_usage=True,
                    device_map={"": 0}  # Explicitly map everything to device 0
                )
                
                # Create pipeline with loaded components
                config.summarizer = pipeline(
                    "summarization", 
                    model=model,
                    tokenizer=tokenizer,
                    device=0
                )
                
                # Verify the pipeline is correctly initialized by doing a small test
                test_text = "This is a test text to verify the summarizer is working. Please generate a summary."
                _ = config.summarizer(test_text, max_length=20, min_length=5, do_sample=False)
                
                logger.info(f"Summarization model {model_name} loaded successfully on GPU with safe loading")
                return True
                
            except Exception as gpu_meta_error:
                logger.warning(f"Error loading with meta tensor handling: {str(gpu_meta_error)}")
                config.summarizer = None  # Reset the summarizer to avoid partial initialization
                gc.collect()
                torch.cuda.empty_cache()
                
                try:
                    # Try a totally different approach that avoids the meta tensor issue
                    logger.info("Trying alternative loading method with CPU first + GPU transfer")
                    # First load to CPU
                    model = AutoModelForSeq2SeqLM.from_pretrained(
                        SUMMARIZER_MODELS[model_name]["name"],
                        torch_dtype=torch.float32,  # Start with float32 on CPU
                    )
                    
                    # Then transfer to GPU with half precision
                    model = model.half().to("cuda:0")
                    
                    # Create pipeline with this model
                    config.summarizer = pipeline(
                        "summarization",
                        model=model,
                        tokenizer=AutoTokenizer.from_pretrained(SUMMARIZER_MODELS[model_name]["name"]),
                        device=0
                    )
                    
                    # Verify
                    test_text = "This is a test text to verify the summarizer is working. Please generate a summary."
                    _ = config.summarizer(test_text, max_length=20, min_length=5, do_sample=False)
                    
                    logger.info(f"Summarization model {model_name} loaded successfully with CPU->GPU transfer")
                    return True
                except Exception as transfer_error:
                    logger.warning(f"Error with CPU->GPU transfer approach: {str(transfer_error)}")
                    config.summarizer = None
                    gc.collect()
                    torch.cuda.empty_cache()
                    
                    try:
                        # Last GPU attempt with simplest approach
                        logger.info("Attempting final GPU loading method with direct pipeline")
                        config.summarizer = pipeline(
                            "summarization", 
                            model=SUMMARIZER_MODELS[model_name]["name"],
                            device=0
                        )
                        
                        # Verify the pipeline
                        test_text = "This is a test text to verify the summarizer is working. Please generate a summary."
                        _ = config.summarizer(test_text, max_length=20, min_length=5, do_sample=False)
                        
                        logger.info(f"Summarization model {model_name} loaded successfully with direct pipeline")
                        return True
                    except Exception as basic_gpu_error:
                        logger.error(f"All GPU loading methods failed: {str(basic_gpu_error)}")
                        config.summarizer = None  # Reset once more
                        gc.collect()
                        torch.cuda.empty_cache()
        
        # CPU fallback
        logger.info("Loading summarizer on CPU")
        try:
            config.summarizer = pipeline(
                "summarization", 
                model=SUMMARIZER_MODELS[model_name]["name"],
                device=-1
            )
            
            # Verify the pipeline
            test_text = "This is a test text to verify the summarizer is working. Please generate a summary."
            _ = config.summarizer(test_text, max_length=20, min_length=5, do_sample=False)
            
            logger.info(f"Summarization model {model_name} loaded successfully on CPU")
            return True
        except Exception as cpu_error:
            logger.error(f"Failed to load on CPU: {str(cpu_error)}")
            config.summarizer = None
            
    except Exception as e:
        logger.error(f"Error loading primary summarizer model: {str(e)}")
        logger.debug(f"Detailed traceback: {traceback.format_exc()}")
        config.summarizer = None
    
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
            
            # Verify the pipeline
            test_text = "This is a test text to verify the summarizer is working. Please generate a summary."
            _ = config.summarizer(test_text, max_length=20, min_length=5, do_sample=False)
            
            logger.info(f"Fallback summarizer {fallback_model} loaded successfully")
            config.current_summarizer_model = fallback_model
            return True
        except Exception as ex:
            logger.error(f"Error loading fallback summarizer {fallback_model}: {str(ex)}")
            config.summarizer = None
    
    # If all models fail
    logger.error("All summarization models failed to load")
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
