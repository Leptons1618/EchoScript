import re
from nltk.tokenize import sent_tokenize
from config import logger, summarizer
from modules.utils import similar

def extract_important_sentences(transcript):
    """Extract important sentences directly from transcript"""
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
        elif 100 <= len(sentence) <= 200 and len(sentence.split()) >= 10:
            important_sentences.append(sentence)
    
    # Limit to 5 sentences to avoid overwhelming the key points section
    return important_sentences[:5]

def generate_notes(transcript):
    """Generate summary notes from transcript"""
    logger.info("Generating notes from transcript")
    
    # Check if summarizer is available
    if summarizer is None:
        logger.warning("Summarizer not available, returning basic summary")
        return {
            "summary": transcript[:1000] + "...",
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
                    max_length=150,
                    min_length=30,
                    do_sample=True,
                    temperature=1.0,
                    num_beams=4,
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
