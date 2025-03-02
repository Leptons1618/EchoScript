import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';
import cogGif from '../assets/icons8-cog.gif';

const Home = () => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // State for configuration modal and selections
  const [showConfig, setShowConfig] = useState(false);
  const [modelType, setModelType] = useState('whisper');
  const [modelSize, setModelSize] = useState('medium');
  // Set status initially to "no model loaded"
  const [modelLoadStatus, setModelLoadStatus] = useState("no model loaded");

  // New useEffect to fetch model status on startup
  useEffect(() => {
    fetch('http://localhost:5000/api/config')
      .then(res => res.json())
      .then(data => {
          setModelLoadStatus(data.model_status || "no model loaded");
      })
      .catch(err => console.error(err));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!youtubeUrl) {
      setError('Please enter a YouTube URL');
      return;
    }
    
    // Simple URL validation
    if (!youtubeUrl.includes('youtube.com/') && !youtubeUrl.includes('youtu.be/')) {
      setError('Please enter a valid YouTube URL');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch('http://localhost:5000/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          youtube_url: youtubeUrl,
          model_type: modelType,
          model_size: modelSize
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        navigate(`/view/${data.job_id}`);
      } else {
        setError(data.error || 'Failed to submit transcription request');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Updated saveConfig function: close popup immediately, show loading animation,
  // then update status to loaded on success.
  const saveConfig = async () => {
    setShowConfig(false);
    setModelLoadStatus("loading");
    try {
      const response = await fetch('http://localhost:5000/api/load_model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_type: modelType, model_size: modelSize }),
      });
      const data = await response.json();
      if (response.ok) {
        console.log(data.message);
        setModelLoadStatus("loaded");
      } else {
        alert('Failed to load the model configuration: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    }
  };

  // Render model status display with animation icons
  const renderModelStatus = () => {
    if (modelLoadStatus === "loading") {
      return (
        <div className="model-status" style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '4px', display: 'flex', alignItems: 'center' }}>
          <span className="spinner" style={{
            width: '16px',
            height: '16px',
            border: '2px solid rgba(0,0,0,0.1)',
            borderTop: '2px solid #4f46e5',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginRight: '8px'
          }}></span>
          <span>Loading model: {modelType} ({modelSize})</span>
        </div>
      );
    } else if (modelLoadStatus === "loaded") {
      return (
        <div className="model-status" style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '4px', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '16px', marginRight: '8px' }}>✔️</span>
          <span>Loaded: {modelType} ({modelSize})</span>
        </div>
      );
    }
  };

  // New helper to validate YouTube URLs
  const isValidYoutubeUrl = (url) => {
    const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//;
    return pattern.test(url.trim());
  };

  return (
    <div className="home-container">
      <div className="hero-section">
        <h1 style={{ fontSize: '2rem' }}>YouTube Transcriber Pro</h1>
        <p style={{ fontSize: '1rem' }} className="subtitle">
          Transcribe, analyze, and take notes from any YouTube video
        </p>

        <form onSubmit={handleSubmit} className="url-form">
          <div className="input-group">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Paste YouTube URL here..."
              className="url-input"
              disabled={isSubmitting || modelLoadStatus !== "loaded"}
            />
            <button
              type="submit"
              className="submit-button"
              disabled={isSubmitting || modelLoadStatus !== "loaded" || !isValidYoutubeUrl(youtubeUrl)}
            >
              {isSubmitting ? 'Processing...' : 'Transcribe'}
            </button>
            {/* New config cog icon */}
            <button 
              type="button" 
              className="config-button" 
              onClick={() => setShowConfig(true)}
              disabled={isSubmitting}
              title="Configure Model"
              style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <img 
                src={cogGif}
                alt="Configure" 
                className="config-icon" 
                style={{ width: '24px', height: '24px' }}
              />
            </button>
          </div>
          {error && <p className="error-message">{error}</p>}
        </form>

        {/* Display loading/loaded model status */}
        {renderModelStatus()}
      </div>

      <div className="features-section">
        <h2 style={{ fontSize: '1.5rem' }}>Advanced Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📝</div>
            <h3 style={{ fontSize: '1.2rem' }}>Accurate Transcription</h3>
            <p>Powered by OpenAI's Whisper, our system delivers high-quality transcriptions</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3 style={{ fontSize: '1.2rem' }}>Smart Notes</h3>
            <p>AI-generated notes that capture key points and summarize content</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⏱️</div>
            <h3 style={{ fontSize: '1.2rem' }}>Time-Stamped</h3>
            <p>Navigate through transcripts with precise time markers</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💾</div>
            <h3 style={{ fontSize: '1.2rem' }}>Save & Export</h3>
            <p>Download transcripts and notes in multiple formats</p>
          </div>
        </div>
      </div>

      {/* New About Section with reduced font sizes */}
      <div
        className="about-section"
        style={{
          padding: '20px',
          textAlign: 'center',
          backgroundColor: '#f3f4f6',
          borderRadius: '12px',
          marginTop: '20px',
          fontSize: '0.8rem' // Reduced overall font size for the about section
        }}
      >
        <h2 style={{ fontSize: '1.1rem' }}>About</h2>
        <p>YT Transcriber Pro is developed by Lept0n5.</p>
        <div
          className="social-links"
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '20px',
            fontSize: '0.9rem' // Reduced social links font size
          }}
        >
          <a
            href="https://www.linkedin.com/in/anish-giri-a4031723a/"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/Leptons1618"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a href="mailto:anishgiri163@gmail.com">Email Me</a>
        </div>
      </div>

      {/* Configuration Modal */}
      {showConfig && (
        <div className="config-modal" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.6)', // darker overlay
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '12px',
            width: modelType === 'whisper' ? '480px' : '320px',  // Increase width for whisper
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            textAlign: 'center'
          }}>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '20px' }}>Model Configuration</h2>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ marginRight: '10px', fontSize: '0.9rem' }}>Type:</label>
              <select 
                value={modelType} 
                onChange={(e) => {
                  setModelType(e.target.value);
                  setModelSize("tiny"); // Reset size on type change
                }} 
                style={{ 
                  fontSize: '0.9rem', 
                  padding: '6px 8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
              >
                <option value="whisper">Whisper</option>
                <option value="faster-whisper">Faster-Whisper</option>
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ marginRight: '10px', fontSize: '0.9rem' }}>Size:</label>
              <select 
                value={modelSize} 
                onChange={(e) => setModelSize(e.target.value)} 
                style={{ 
                  fontSize: '0.9rem', 
                  padding: '6px 8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
              >
                {modelType === 'faster-whisper' ? (
                  <>
                    <option value="tiny">tiny</option>
                    <option value="base">base</option>
                    <option value="small">small</option>
                    <option value="medium">medium</option>
                    <option value="large">large</option>
                    <option value="turbo">turbo</option>
                  </>
                ) : (
                  <>
                    <option value="tiny">tiny</option>
                    <option value="base">base</option>
                    <option value="small">small</option>
                    <option value="medium">medium</option>
                    <option value="turbo">turbo</option>
                  </>
                )}
              </select>
            </div>
            {modelType === 'whisper' ? (
              <div style={{ marginBottom: '20px', maxHeight: '150px', overflowY: 'auto', fontSize: '0.8rem', textAlign: 'left' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: '1px solid #ddd', padding: '4px' }}>Size</th>
                      <th style={{ borderBottom: '1px solid #ddd', padding: '4px' }}>Params</th>
                      <th style={{ borderBottom: '1px solid #ddd', padding: '4px' }}>Eng-only</th>
                      <th style={{ borderBottom: '1px solid #ddd', padding: '4px' }}>Multi</th>
                      <th style={{ borderBottom: '1px solid #ddd', padding: '4px' }}>VRAM</th>
                      <th style={{ borderBottom: '1px solid #ddd', padding: '4px' }}>Speed</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '4px' }}>tiny</td>
                      <td style={{ padding: '4px' }}>39M</td>
                      <td style={{ padding: '4px' }}>tiny.en</td>
                      <td style={{ padding: '4px' }}>tiny</td>
                      <td style={{ padding: '4px' }}>~1GB</td>
                      <td style={{ padding: '4px' }}>~10x</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '4px' }}>base</td>
                      <td style={{ padding: '4px' }}>74M</td>
                      <td style={{ padding: '4px' }}>base.en</td>
                      <td style={{ padding: '4px' }}>base</td>
                      <td style={{ padding: '4px' }}>~1GB</td>
                      <td style={{ padding: '4px' }}>~7x</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '4px' }}>small</td>
                      <td style={{ padding: '4px' }}>244M</td>
                      <td style={{ padding: '4px' }}>small.en</td>
                      <td style={{ padding: '4px' }}>small</td>
                      <td style={{ padding: '4px' }}>~2GB</td>
                      <td style={{ padding: '4px' }}>~4x</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '4px' }}>medium</td>
                      <td style={{ padding: '4px' }}>769M</td>
                      <td style={{ padding: '4px' }}>medium.en</td>
                      <td style={{ padding: '4px' }}>medium</td>
                      <td style={{ padding: '4px' }}>~5GB</td>
                      <td style={{ padding: '4px' }}>~2x</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '4px' }}>turbo</td>
                      <td style={{ padding: '4px' }}>809M</td>
                      <td style={{ padding: '4px' }}>N/A</td>
                      <td style={{ padding: '4px' }}>turbo</td>
                      <td style={{ padding: '4px' }}>~6GB</td>
                      <td style={{ padding: '4px' }}>~8x</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ marginBottom: '20px', fontSize: '0.8rem' }}>
                Detailed model info is not available for Faster-Whisper.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button 
                onClick={saveConfig}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Save Configuration
              </button>
              <button 
                onClick={() => setShowConfig(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;