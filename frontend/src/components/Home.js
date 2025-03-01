// src/components/Home.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const Home = () => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

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
        body: JSON.stringify({ youtube_url: youtubeUrl }),
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
  
  return (
    <div className="home-container">
      <div className="hero-section">
        <h1>YouTube Transcriber Pro</h1>
        <p className="subtitle">Transcribe, analyze, and take notes from any YouTube video</p>
        
        <form onSubmit={handleSubmit} className="url-form">
          <div className="input-group">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Paste YouTube URL here..."
              className="url-input"
              disabled={isSubmitting}
            />
            <button type="submit" className="submit-button" disabled={isSubmitting}>
              {isSubmitting ? 'Processing...' : 'Transcribe'}
            </button>
          </div>
          {error && <p className="error-message">{error}</p>}
        </form>
      </div>
      
      <div className="features-section">
        <h2>Advanced Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📝</div>
            <h3>Accurate Transcription</h3>
            <p>Powered by OpenAI's Whisper, our system delivers high-quality transcriptions</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Smart Notes</h3>
            <p>AI-generated notes that capture key points and summarize content</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⏱️</div>
            <h3>Time-Stamped</h3>
            <p>Navigate through transcripts with precise time markers</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💾</div>
            <h3>Save & Export</h3>
            <p>Download transcripts and notes in multiple formats</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;