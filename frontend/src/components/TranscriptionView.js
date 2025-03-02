// src/components/TranscriptionView.js
import React, { useState, useEffect, useRef } from 'react';
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
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const prevStatusRef = useRef('');
  
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
  }, [jobId, jobStatus.status]);
  
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
  
  // Log status changes for background display
  useEffect(() => {
    if (prevStatusRef.current !== jobStatus.status) {
      setLogs(prev => [...prev, `Status changed to: ${jobStatus.status}`]);
      prevStatusRef.current = jobStatus.status;
    }
  }, [jobStatus.status]);
  
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
          <div className="status-text">{statusMessages[jobStatus.status] || jobStatus.status} ({progress}%)</div>
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
      {/* Conditionally render log-display only when not complete and not error */}
      {jobStatus.status !== 'complete' && jobStatus.status !== 'error' && (
        <div className="log-display" style={{
          marginTop: '20px',
          fontSize: '0.8rem',
          color: '#666',
          background: '#f9f9f9',
          padding: '10px',
          borderRadius: '6px',
          maxHeight: '150px',
          overflowY: 'auto'
        }}>
          {logs.map((msg, index) => <div key={index}>{msg}</div>)}
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