// src/components/TranscriptionView.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jsPDF } from "jspdf";
import './TranscriptionView.css';

const TranscriptionView = () => {
  const { jobId } = useParams();
  const [jobStatus, setJobStatus] = useState({ status: 'loading' });
  const [transcript, setTranscript] = useState(null);
  const [notes, setNotes] = useState(null);
  const [activeTab, setActiveTab] = useState('transcript');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [timeEstimate, setTimeEstimate] = useState(null);
  const prevStatusRef = useRef('');
  const startTimeRef = useRef(Date.now());
  const pollIntervalRef = useRef(null);
  const navigate = useNavigate();
  
  // Determine target progress based on status
  const getTargetProgress = (status) => {
    switch(status) {
      case 'downloading': return 20;
      case 'transcribing': return 90;  // heavy phase gets more range
      case 'generating_notes': return 100;
      case 'complete': return 100;
      default: return 0;
    }
  };
  
  useEffect(() => {
    // Add initial log message
    const timestamp = new Date().toLocaleTimeString();
    setLogs([`[${timestamp}] Starting transcription process...`]);
    startTimeRef.current = Date.now();
    
    // Poll job status
    const checkStatus = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/job/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setJobStatus(data);
          
          // If complete, fetch transcript and notes
          if (data.status === 'complete') {
            fetchTranscriptAndNotes();
            // Clear polling interval on completion
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          } else if (data.status === 'error') {
            setError(data.error || 'An error occurred processing this video');
            // Clear polling interval on error
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
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
          
          // Log transcript segments received
          const timestamp = new Date().toLocaleTimeString();
          setLogs(prev => [
            ...prev, 
            `[${timestamp}] Transcript received with ${transcriptData.segments?.length || 0} segments`
          ]);
        }
        
        // Fetch notes
        const notesResponse = await fetch(`http://localhost:5000/api/notes/${jobId}`);
        if (notesResponse.ok) {
          const notesData = await notesResponse.json();
          setNotes(notesData);
          
          // Log notes received
          const timestamp = new Date().toLocaleTimeString();
          setLogs(prev => [
            ...prev, 
            `[${timestamp}] Smart notes generated successfully`
          ]);
          
          // Add a final completion message
          setTimeout(() => {
            const finalTimestamp = new Date().toLocaleTimeString();
            setLogs(prev => [
              ...prev, 
              `[${finalTimestamp}] All processing complete! Enjoy your transcript.`
            ]);
          }, 1000);
        }
      } catch (err) {
        setError('Error fetching transcript data');
        console.error(err);
      }
    };
    
    checkStatus();
    
    // Poll until complete
    pollIntervalRef.current = setInterval(() => {
      if (jobStatus.status !== 'complete' && jobStatus.status !== 'error') {
        checkStatus();
      }
    }, 5000);
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [jobId]);
  
  // Timer to update progress gradually until target progress is reached
  useEffect(() => {
    const target = getTargetProgress(jobStatus.status);
    // Use a lower increment during transcription for smoothness, higher for others
    const increment = jobStatus.status === 'transcribing' ? 1 : 4;
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev < target) return Math.min(prev + increment, target);
        return prev;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [jobStatus.status]);
  
  // Calculate and update time estimate
  useEffect(() => {
    if (progress > 0 && progress < 100) {
      const elapsedMs = Date.now() - startTimeRef.current;
      const estimatedTotalMs = (elapsedMs / progress) * 100;
      const remainingMs = estimatedTotalMs - elapsedMs;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      setTimeEstimate(remainingMinutes);
    }
  }, [progress]);
  
  // Log status changes for background display with timestamps
  useEffect(() => {
    if (prevStatusRef.current !== jobStatus.status && jobStatus.status) {
      const timestamp = new Date().toLocaleTimeString();
      let statusMessage = '';
      
      switch(jobStatus.status) {
        case 'downloading':
          statusMessage = 'Downloading audio from YouTube video...';
          break;
        case 'transcribing':
          statusMessage = 'Transcribing audio to text (this may take several minutes)...';
          break;
        case 'generating_notes':
          statusMessage = 'Generating smart notes from transcript...';
          break;
        case 'complete':
          statusMessage = 'Processing complete! Loading results...';
          break;
        case 'error':
          statusMessage = 'Error encountered during processing.';
          break;
        default:
          statusMessage = `Status changed to: ${jobStatus.status}`;
      }
      
      setLogs(prev => [...prev, `[${timestamp}] ${statusMessage}`]);
      prevStatusRef.current = jobStatus.status;
      
      // Every 10 seconds during transcription, add a reassuring message
      if (jobStatus.status === 'transcribing') {
        const reassuranceInterval = setInterval(() => {
          const newTimestamp = new Date().toLocaleTimeString();
          setLogs(prev => [
            ...prev, 
            `[${newTimestamp}] Still transcribing audio... ${
              timeEstimate ? `(estimated ${timeEstimate} min remaining)` : ''
            }`
          ]);
        }, 10000);
        
        return () => clearInterval(reassuranceInterval);
      }
    }
  }, [jobStatus.status, timeEstimate]);
  
  // Auto-navigate to completed transcript view when ready
  useEffect(() => {
    if (jobStatus.status === 'complete' && transcript && notes) {
      // Add a slight delay to let user see the completion message
      const navTimer = setTimeout(() => {
        // Use the same URL but force component rerender to show the completed view
        navigate(`/view/${jobId}`, { replace: true });
      }, 2000);
      
      return () => clearTimeout(navTimer);
    }
  }, [jobStatus.status, transcript, notes, jobId, navigate]);
  
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

  const renderProgressStatus = () => {
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
          <div className="status-text">
            {statusMessages[jobStatus.status] || jobStatus.status} ({progress}%)
            {timeEstimate && jobStatus.status === 'transcribing' && 
              ` • Est. ${timeEstimate} min remaining`}
          </div>
        </div>
        {jobStatus.status !== "complete" && jobStatus.status !== "error" && (
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${progress}%`
                }}
              ></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTranscript = () => {
    if (!transcript) return <p>Transcript not available yet.</p>;
    
    return (
      <div className="transcript-container">
        <div className="transcript-segments">
          {transcript.segments.map((segment, index) => (
            <div key={index} className="transcript-segment">
              <div className="segment-time">{formatTime(segment.start)}</div>
              <div className="segment-text">{segment.text}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  const renderNotes = () => {
    if (!notes) return <p>Notes not available yet.</p>;
    
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
            {jobStatus.status !== 'complete' && renderProgressStatus()}
          </div>
          
          {jobStatus.status === 'complete' && (
            <>
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
                  Export as PDF
                </button>
                <button className="export-button" onClick={exportAsTXT}>
                  Export as TXT
                </button>
              </div>
            </>
          )}
        </>
      )}
      {/* Improved log display section */}
      {jobStatus.status !== 'complete' && jobStatus.status !== 'error' && (
        <div className="log-display">
          <h4>Transcription Progress</h4>
          <div className="log-messages">
            {logs.map((msg, index) => <div key={index} className="log-entry">{msg}</div>)}
          </div>
        </div>
      )}
      {/* Footer */}
      <footer style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', color: '#6b7280' }}>
        Created by Lept0n5
      </footer>
    </div>
  );
};

export default TranscriptionView;