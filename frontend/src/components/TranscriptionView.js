// src/components/TranscriptionView.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { jsPDF } from "jspdf";
import './TranscriptionView.css';

const TranscriptionView = () => {
  const { jobId } = useParams();
  const [jobStatus, setJobStatus] = useState({ status: 'loading' });
  const [transcript, setTranscript] = useState(null);
  const [notes, setNotes] = useState(null);
  const [activeTab, setActiveTab] = useState('transcript');
  const [error, setError] = useState('');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [videoId, setVideoId] = useState(null);
  const playerRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const prevStatusRef = useRef('');
  const [transcriptionLogs, setTranscriptionLogs] = useState([]);
  const logInterval = useRef(null);
  const [statusHistory, setStatusHistory] = useState([]); // Renamed from logs
  
  // New state for transcript search
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  
  // Extract YouTube Video ID from URL
  const extractYoutubeId = useCallback((url) => {
    if (!url) return null;
    
    // Fixed regex pattern
    const regExp = /^.*(youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }, []);
  
  // Scroll to a specific segment
  const scrollToSegment = useCallback((index) => {
    const segmentEl = document.getElementById(`segment-${index}`);
    if (segmentEl && transcriptContainerRef.current) {
      const containerRect = transcriptContainerRef.current.getBoundingClientRect();
      const segmentRect = segmentEl.getBoundingClientRect();
      
      if (segmentRect.top < containerRect.top || segmentRect.bottom > containerRect.bottom) {
        segmentEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, []);
  
  // Update current segment based on video time and scroll to it
  const updateCurrentSegment = useCallback((currentTime) => {
    if (!transcript || !transcript.segments) return;
    
    const segmentIndex = transcript.segments.findIndex(seg => 
      currentTime >= seg.start && currentTime < seg.end
    );
    
    if (segmentIndex !== -1 && segmentIndex !== currentSegmentIndex) {
      setCurrentSegmentIndex(segmentIndex);
      scrollToSegment(segmentIndex);
    }
  }, [transcript, currentSegmentIndex, scrollToSegment]);
  
  useEffect(() => {
    // Poll job status
    const checkStatus = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/job/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setJobStatus(data);
          
          // Extract YouTube video ID if we have a URL
          if (data.url && !videoId) {
            const extractedId = extractYoutubeId(data.url);
            if (extractedId) {
              setVideoId(extractedId);
            }
          }
          
          // If complete, fetch transcript and notes
          if (data.status === 'complete') {
            fetchTranscriptAndNotes();
          } else if (data.status === 'error') {
            setError(data.error || 'An error occurred processing this video');
          }
        } else {
          setError('Failed to fetch job status');
        }
      } catch (err) {
        setError('Error connecting to server');
        console.error(err);
      }
    };
    
    const fetchTranscriptAndNotes = async () => {
      try {
        // Fetch transcript
        const transcriptResponse = await fetch(`http://localhost:5000/api/transcript/${jobId}`);
        if (transcriptResponse.ok) {
          const transcriptData = await transcriptResponse.json();
          setTranscript(transcriptData);
          
          // Extract video ID from youtube_url 
          if (!videoId && transcriptData.youtube_url) {
            const id = extractYoutubeId(transcriptData.youtube_url);
            if (id) setVideoId(id);
          }
        }
        
        // Fetch notes
        const notesResponse = await fetch(`http://localhost:5000/api/notes/${jobId}`);
        if (notesResponse.ok) {
          const notesData = await notesResponse.json();
          setNotes(notesData);
        }
      } catch (err) {
        setError('Error fetching transcript data');
        console.error(err);
      }
    };
    
    checkStatus();
    
    // Poll until complete
    const interval = setInterval(() => {
      if (jobStatus.status !== 'complete' && jobStatus.status !== 'error') {
        checkStatus();
      } else {
        clearInterval(interval);
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [jobId, jobStatus.status, videoId, extractYoutubeId]);
  
  // Initialize YouTube player once we have a video ID
  useEffect(() => {
    if (!videoId || !transcript || !transcript.segments) return;
    
    // Load YouTube API if not already loaded
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      
      window.onYouTubeIframeAPIReady = initPlayer;
    } else {
      initPlayer();
    }
    
    function initPlayer() {
      if (playerRef.current) {
        return;
      }
      
      playerRef.current = new window.YT.Player('youtube-player', {
        videoId: videoId,
        playerVars: {
          'playsinline': 1,
          'modestbranding': 1,
          'rel': 0
        },
        events: {
          'onStateChange': onPlayerStateChange,
          'onReady': onPlayerReady
        }
      });
    }
    
    function onPlayerReady(event) {
      // Player is ready
      console.log('Player ready');
    }
    
    function onPlayerStateChange(event) {
      // When the video is playing, update current segment based on time
      if (event.data === window.YT.PlayerState.PLAYING) {
        const intervalId = setInterval(() => {
          if (playerRef.current && transcript && transcript.segments) {
            const currentTime = playerRef.current.getCurrentTime();
            updateCurrentSegment(currentTime);
          }
        }, 500);
        
        return () => clearInterval(intervalId);
      }
    }
    
  }, [videoId, transcript, updateCurrentSegment]);
  
  // Handle click on a segment to jump to that time in the video
  const handleSegmentClick = useCallback((startTime) => {
    if (playerRef.current) {
      playerRef.current.seekTo(startTime, true);
      playerRef.current.playVideo();
    }
  }, []);
  
  // Log status changes for background display
  useEffect(() => {
    if (prevStatusRef.current !== jobStatus.status) {
      setStatusHistory(prev => [...prev, `Status changed to: ${jobStatus.status}`]);
      prevStatusRef.current = jobStatus.status;
    }
  }, [jobStatus.status]);

  // Consolidate the log polling into a single, optimized implementation that
  // properly stops when transcription is complete
  useEffect(() => {
    // Flag to track if this effect is still active
    let isActive = true;
    let lastLogCount = 0;
    
    // Clear any existing polling interval
    if (logInterval.current) {
      clearInterval(logInterval.current);
      logInterval.current = null;
    }
    
    // Start polling only if we're in transcribing state
    if (jobStatus.status === 'transcribing') {
      // Clear logs when starting transcription
      setTranscriptionLogs([]);
      
      // Define the polling function with adaptive interval
      const getPollingInterval = (logCount) => {
        return Math.min(2000, Math.max(500, logCount * 10));
      };
      
      const fetchLogs = async () => {
        // If component unmounted or status changed, stop polling
        if (!isActive || jobStatus.status !== 'transcribing') {
          return;
        }

        try {
          const response = await fetch(`http://localhost:5000/api/logs/${jobId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.logs && data.logs.length > 0) {
              // Only update state when new logs arrive
              if (data.logs.length !== lastLogCount) {
                setTranscriptionLogs(data.logs);
                lastLogCount = data.logs.length;
                
                // Auto-scroll to latest log entries
                window.requestAnimationFrame(() => {
                  const logsContainer = document.querySelector('.transcription-logs');
                  if (logsContainer) {
                    logsContainer.scrollTop = logsContainer.scrollHeight;
                  }
                });
              }
            }
          }
          
          // Check again if we should continue - stop if status changed
          if (isActive && jobStatus.status === 'transcribing') {
            setTimeout(fetchLogs, getPollingInterval(lastLogCount));
          }
        } catch (err) {
          console.error('Error fetching logs:', err);
          // Retry after 2 seconds if still transcribing
          if (isActive && jobStatus.status === 'transcribing') {
            setTimeout(fetchLogs, 2000);
          }
        }
      };
      
      // Start initial polling
      fetchLogs();
    }
    
    // Cleanup: stop polling on unmount or when status changes
    return () => {
      isActive = false;
    };
  }, [jobId, jobStatus.status]); // Only re-run when jobId or status changes

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  const exportAsTXT = () => {
    let content = "";
    if (transcript && transcript.text) {
      content += "Transcript:\n" + transcript.text + "\n\n";
    }
    if (notes && notes.summary) {
      content += "Notes Summary:\n" + notes.summary + "\n\n";
    }
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `export_${jobId}.txt`;
    link.click();
  };

  const exportAsPDF = () => {
    let content = "";
    if (transcript && transcript.text) {
      content += "Transcript:\n" + transcript.text + "\n\n";
    }
    if (notes && notes.summary) {
      content += "Notes Summary:\n" + notes.summary + "\n\n";
    }
    const doc = new jsPDF();
    const lines = doc.splitTextToSize(content, 180);
    doc.text(lines, 10, 10);
    doc.save(`export_${jobId}.pdf`);
  };

  // Search functionality for transcript
  const searchTranscript = useCallback(() => {
    if (!transcript || !transcript.segments || !transcriptSearch.trim()) {
      setSearchResults([]);
      return;
    }
    
    const query = transcriptSearch.toLowerCase();
    const results = transcript.segments
      .map((segment, index) => ({segment, index}))
      .filter(({segment}) => segment.text.toLowerCase().includes(query));
    
    setSearchResults(results);
    setCurrentSearchIndex(0);
    
    // Scroll to first result if exists
    if (results.length > 0) {
      scrollToSegment(results[0].index);
      setCurrentSegmentIndex(results[0].index);
    }
  }, [transcript, transcriptSearch, scrollToSegment]);
  
  // Navigate to next search result - wrapped in useCallback
  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    
    const newIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    scrollToSegment(searchResults[newIndex].index);
    setCurrentSegmentIndex(searchResults[newIndex].index);
  }, [searchResults, currentSearchIndex, scrollToSegment, setCurrentSegmentIndex]);
  
  // Navigate to previous search result - wrapped in useCallback
  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    
    const newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    scrollToSegment(searchResults[newIndex].index);
    setCurrentSegmentIndex(searchResults[newIndex].index);
  }, [searchResults, currentSearchIndex, scrollToSegment, setCurrentSegmentIndex]);
  
  // Clear transcript search - wrapped in useCallback
  const clearSearch = useCallback(() => {
    setTranscriptSearch('');
    setSearchResults([]);
  }, [setTranscriptSearch, setSearchResults]);

  // Add keyboard event handler for search - updated dependencies
  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      searchTranscript();
    } else if (e.key === 'F3' || (e.ctrlKey && e.key === 'g')) {
      e.preventDefault();
      nextSearchResult();
    } else if (e.key === 'F3' && e.shiftKey) {
      e.preventDefault();
      prevSearchResult();
    } else if (e.key === 'Escape') {
      clearSearch();
    }
  }, [searchTranscript, nextSearchResult, prevSearchResult, clearSearch]);

  const renderStatusMessage = () => {
    const statusMessages = {
      downloading: "Downloading video audio...",
      transcribing: "Transcribing audio (this may take a few minutes)...",
      generating_notes: "Generating smart notes from transcript...",
      complete: "Processing complete!",
      error: "Error processing video."
    };

    return (
      <div className="processing-status">
        <div className="status-indicator">
          <div className={`status-icon ${jobStatus.status}`}></div>
          <div className="status-text">{statusMessages[jobStatus.status] || jobStatus.status}</div>
        </div>
      </div>
    );
  };

  // Move formatTime and highlightSearchTerm inside useMemo to avoid dependency warnings
  const memoizedSegments = useMemo(() => {
    if (!transcript || !transcript.segments) return [];
    
    // Use the formatTime function from outer scope
    
    // Define highlightSearchTerm inside the useMemo callback
    const highlightSearchTerm = (text) => {
      if (!transcriptSearch.trim()) return text;
      
      const parts = text.split(new RegExp(`(${transcriptSearch})`, 'gi'));
      
      return (
        <>
          {parts.map((part, i) => 
            part.toLowerCase() === transcriptSearch.toLowerCase() ? 
              <mark key={i} className="search-highlight">{part}</mark> : 
              part
          )}
        </>
      );
    };
    
    return transcript.segments.map((segment, index) => (
      <div 
        key={index} 
        id={`segment-${index}`}
        className={`transcript-segment ${index === currentSegmentIndex ? 'active' : ''} ${
          searchResults.some(r => r.index === index) ? 'search-result' : ''
        }`}
        onClick={() => handleSegmentClick(segment.start)}
      >
        <div className="segment-time">{formatTime(segment.start)}</div>
        <div className="segment-text">
          {transcriptSearch ? highlightSearchTerm(segment.text) : segment.text}
        </div>
      </div>
    ));
  }, [transcript, currentSegmentIndex, searchResults, transcriptSearch, handleSegmentClick]);

  // Optimize the rendering of transcript segments by virtualizing the list
  const renderTranscript = () => {
    if (!transcript) return <p>Transcript not available yet.</p>;
    
    return (
      <>
        <div className="transcript-search">
          <div className="search-container">
            <input
              type="text"
              value={transcriptSearch}
              onChange={(e) => setTranscriptSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search in transcript... (press Enter to search)"
              className="search-input"
            />
            <button className="search-button" onClick={searchTranscript} title="Search (Enter)">
              <span role="img" aria-label="search">🔍</span>
            </button>
            {searchResults.length > 0 && (
              <div className="search-results-info">
                <span>
                  {currentSearchIndex + 1} of {searchResults.length} results
                </span>
                <button className="nav-button" onClick={prevSearchResult} title="Previous result (Shift+F3)">
                  ↑
                </button>
                <button className="nav-button" onClick={nextSearchResult} title="Next result (F3 or Ctrl+G)">
                  ↓
                </button>
                <button className="clear-button" onClick={clearSearch} title="Clear search (Esc)">
                  ×
                </button>
                <div className="keyboard-shortcut">
                  <kbd>F3</kbd> for next, <kbd>Shift+F3</kbd> for previous, <kbd>Esc</kbd> to clear
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="transcript-container" ref={transcriptContainerRef}>
          <div className="transcript-segments">
            {memoizedSegments}
          </div>
        </div>
      </>
    );
  };
  
  const renderNotes = () => {
    if (!notes) {
      // Check if notes are being generated
      if (jobStatus.status === 'generating_notes') {
        return (
          <div className="notes-generating">
            <div className="notes-spinner"></div>
            <p>Generating smart notes from transcript...</p>
          </div>
        );
      }
      return <p>Notes not available yet.</p>;
    }
    
    return (
      <div className="notes-container">
        <div className="notes-section">
          <h3>Summary</h3>
          <p>{notes.summary}</p>
        </div>
        
        <div className="notes-section">
          <h3>Key Points</h3>
          <ul className="key-points-list">
            {notes.key_points.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  };
  
  // Revamped function to render processing logs with animation
  const renderProcessingLogs = () => {
    return (
      <div className="processing-container">
        <div className="log-display">
          {/* Add a status history section */}
          {statusHistory.length > 0 && (
            <div className="status-history">
              <div className="transcription-header">
                <span>Processing History</span>
              </div>
              <div className="status-history-logs">
                {statusHistory.map((message, index) => (
                  <div key={`status-${index}`} className="status-history-entry">
                    {message}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Show real-time transcription logs during transcription */}
          {jobStatus.status === 'transcribing' && (
            <div className="transcription-progress">
              <div className="transcription-header">
                <div className="pulse-icon"></div>
                <span>Real-time Transcription</span>
                <div className="log-counter">{transcriptionLogs.length} segments</div>
              </div>
              
              <div className="transcription-logs" style={{ maxHeight: '350px', overflow: 'auto' }}>
                {transcriptionLogs.length > 0 ? (
                  transcriptionLogs.map((log, index) => (
                    <div 
                      key={`transcript-${index}`} 
                      className={`log-transcript-entry ${
                        index === transcriptionLogs.length - 1 ? 'new-entry' : ''
                      }`}
                    >
                      {log}
                    </div>
                  ))
                ) : (
                  <div className="transcription-initializing">
                    <div className="initializing-animation"></div>
                    <p className="log-waiting">Initializing transcription...</p>
                  </div>
                )}
              </div>
              
              {/* Show progress indicator */}
              {transcriptionLogs.length > 0 && (
                <div className="transcription-progress-indicator">
                  <div className="progress-text">
                    Transcription in progress - {transcriptionLogs.length} segments processed
                  </div>
                </div>
              )}
            </div>
          )}
          
          {jobStatus.status === 'generating_notes' && (
            <div className="generating-notes-indicator">
              <div className="notes-spinner"></div>
              <p>Generating smart notes from transcript...</p>
            </div>
          )}
          
          {jobStatus.status === 'downloading' && (
            <div className="downloading-indicator">
              <div className="download-animation"></div>
              <p>Downloading video audio...</p>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="transcription-view">
      {error ? (
        <div className="error-container">
          <h2>Error</h2>
          <p>{error}</p>
        </div>
      ) : (
        <>
          <div className="video-info">
            {jobStatus.title && (
              <>
                <h2 className="video-title">{jobStatus.title}</h2>
                {jobStatus.channel && <p className="video-channel">By {jobStatus.channel}</p>}
              </>
            )}
            {jobStatus.status !== 'complete' && renderStatusMessage()}
          </div>
          
          {/* Show processing logs or completed content */}
          {jobStatus.status !== 'complete' ? (
            renderProcessingLogs()
          ) : (
            // Only show video and transcript once complete
            <>
              {/* YouTube Video Embed */}
              <div className="video-container">
                <div id="youtube-player"></div>
              </div>
              
              <div className="tabs">
                <button 
                  className={`tab ${activeTab === 'transcript' ? 'active' : ''}`}
                  onClick={() => setActiveTab('transcript')}
                >
                  Transcript
                </button>
                <button 
                  className={`tab ${activeTab === 'notes' ? 'active' : ''}`}
                  onClick={() => setActiveTab('notes')}
                >
                  Smart Notes
                </button>
              </div>
              
              <div className="tab-content">
                {activeTab === 'transcript' ? renderTranscript() : renderNotes()}
              </div>
              
              <div className="export-options">
                <button className="export-button" onClick={exportAsPDF}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  Export as PDF
                </button>
                <button className="export-button" onClick={exportAsTXT}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  Export as TXT
                </button>
              </div>
            </>
          )}
        </>
      )}
      <footer style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', color: '#6b7280' }}>
        Created by Lept0n5
      </footer>
    </div>
  );
};

export default TranscriptionView;