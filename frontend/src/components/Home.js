import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';
// Replace the cog gif import with React Icons imports
import { FiSettings } from 'react-icons/fi';
import { FaFileAlt, FaChartBar, FaClock, FaSave } from 'react-icons/fa';

const Home = () => {
  // Add a function to safely handle localStorage operations
  const getStoredConfig = () => {
    try {
      const storedConfig = localStorage.getItem('modelConfig');
      if (storedConfig) {
        return JSON.parse(storedConfig);
      }
    } catch (error) {
      console.error("Error reading from localStorage:", error);
    }
    return {};
  };

  const saveToStorage = (config) => {
    try {
      localStorage.setItem('modelConfig', JSON.stringify(config));
      console.log("Configuration saved to localStorage:", config);
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }
  };

  // Get saved config immediately for initial state values
  const savedConfig = getStoredConfig();
  
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // State for configuration modal and selections - initialize from localStorage
  const [showConfig, setShowConfig] = useState(false);
  const [modelType, setModelType] = useState(savedConfig.modelType || 'whisper');
  const [modelSize, setModelSize] = useState(savedConfig.modelSize || 'medium');
  const [modelLoadStatus, setModelLoadStatus] = useState(savedConfig.modelLoadStatus || "no model loaded");
  const [summarizerModel, setSummarizerModel] = useState(savedConfig.summarizerModel || 'bart-large-cnn');
  const [availableSummarizers, setAvailableSummarizers] = useState({});
  const [summarizerStatus, setSummarizerStatus] = useState(savedConfig.summarizerStatus || "no summarizer loaded");
  const [language, setLanguage] = useState(savedConfig.language || ''); // '' means auto-detect

  // Now just fetch from server to ensure we have the latest data
  useEffect(() => {
    // First apply any saved settings from localStorage to the state
    const savedConfig = getStoredConfig();
    if (savedConfig.modelType) setModelType(savedConfig.modelType);
    if (savedConfig.modelSize) setModelSize(savedConfig.modelSize);
    if (savedConfig.modelLoadStatus) setModelLoadStatus(savedConfig.modelLoadStatus);
    if (savedConfig.summarizerModel) setSummarizerModel(savedConfig.summarizerModel);
    if (savedConfig.summarizerStatus) setSummarizerStatus(savedConfig.summarizerStatus);
    if (savedConfig.language) setLanguage(savedConfig.language);
    
    // Then fetch from server
    fetch('http://localhost:5000/api/config')
      .then(res => res.json())
      .then(data => {
        // Update model status - PRESERVE LOADED STATUS from localStorage
        // Only update if server explicitly says the model is loaded or not loaded
        const updatedModelStatus = data.model_status === "loaded" || data.model_status === "loading" 
          ? data.model_status 
          : (savedConfig.modelLoadStatus === "loaded" ? "loaded" : data.model_status || modelLoadStatus);
          
        const updatedSummarizerStatus = data.summarizer_status === "loaded" || data.summarizer_status === "loading"
          ? data.summarizer_status
          : (savedConfig.summarizerStatus === "loaded" ? "loaded" : data.summarizer_status || summarizerStatus);
        
        setModelLoadStatus(updatedModelStatus);
        setSummarizerStatus(updatedSummarizerStatus);
        
        // Update model type and size from server configuration
        const updatedModelType = data.model_type || modelType;
        const updatedModelSize = data.model_size || modelSize;
        const updatedSummarizerModel = data.summarizer_model || summarizerModel;
        
        if (data.model_type) {
          setModelType(updatedModelType);
        }
        if (data.model_size) {
          setModelSize(updatedModelSize);
        }
        if (data.summarizer_model) {
          setSummarizerModel(updatedSummarizerModel);
        }
        
        // Store available summarizers
        if (data.available_summarizers) {
          setAvailableSummarizers(data.available_summarizers);
        }
        
        // Save this configuration to localStorage
        const configToSave = {
          modelType: updatedModelType,
          modelSize: updatedModelSize,
          summarizerModel: updatedSummarizerModel,
          modelLoadStatus: updatedModelStatus, // Use the preserved status
          summarizerStatus: updatedSummarizerStatus, // Use the preserved status
          language: savedConfig.language || language
        };
        
        saveToStorage(configToSave);
        
        console.log("Loaded model configuration:", updatedModelType, updatedModelSize, updatedSummarizerModel);
      })
      .catch(err => {
        console.error("Error loading configuration:", err);
        // On error, maintain the localStorage settings
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create a separate effect to update localStorage when model settings change
  useEffect(() => {
    const config = getStoredConfig();
    const updatedConfig = {
      ...config,
      modelType,
      modelSize,
      summarizerModel,
      modelLoadStatus,
      summarizerStatus,
      language
    };
    saveToStorage(updatedConfig);
  }, [modelType, modelSize, summarizerModel, modelLoadStatus, summarizerStatus, language]);

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
          model_size: modelSize,
          language: language // Add language to the request
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

  // Add useEffect for language-based model recommendation
  useEffect(() => {
    // When language changes, recommend appropriate summarizer model
    if (['hi', 'bn'].includes(language)) {
      // Get the specialized model for this language
      const recommendedModel = language === 'hi' ? 'ai4bharat/IndicBART' : 'google/mt5-base';
      
      // Check if the model is available in our options
      if (availableSummarizers[recommendedModel]) {
        // Show a recommendation notification
        const confirmed = window.confirm(
          `You've selected ${language === 'hi' ? 'Hindi' : 'Bengali'}. Would you like to use the specialized ${
            recommendedModel.split('/')[1]
          } summarization model for better results?`
        );
        
        if (confirmed) {
          setSummarizerModel(recommendedModel);
        }
      }
    }
  }, [language, availableSummarizers]);

  // Add an effect to update localStorage when language changes
  useEffect(() => {
    // Get current config from localStorage
    const savedConfig = getStoredConfig();
    // Update language and save back
    savedConfig.language = language;
    saveToStorage(savedConfig);
  }, [language]);

  // Updated saveConfig function to also save to localStorage
  const saveConfig = async () => {
    setShowConfig(false);
    setModelLoadStatus("loading");
    try {
      const response = await fetch('http://localhost:5000/api/load_model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model_type: modelType, 
          model_size: modelSize,
          summarizer_model: summarizerModel 
        }),
      });
      const data = await response.json();
      if (response.ok) {
        console.log(data.message);
        setModelLoadStatus("loaded");
        setSummarizerStatus("loaded");
        
        // Save updated configuration to localStorage
        saveToStorage({
          modelType,
          modelSize,
          summarizerModel,
          modelLoadStatus: "loaded",
          summarizerStatus: "loaded",
          language
        });
      } else {
        alert('Failed to load the model configuration: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
    }
  };

  // Enhance the renderModelStatus function to show current model details
  const renderModelStatus = () => {
    if (modelLoadStatus === "loading") {
      return (
        <div className="model-status-container">
          <div className="spinner-container">
            <div className="status-spinner"></div>
          </div>
          <span className="status-text">Loading model: {modelType} ({modelSize})</span>
        </div>
      );
    } else if (modelLoadStatus === "loaded") {
      return (
        <div className="model-status-container">
          <div className="status-icon-success">✓</div>
          <span className="status-text">
            <span className="model-name">{modelType}</span> 
            <span className="model-size">({modelSize})</span>
            {summarizerStatus === "loaded" && (
              <span className="summarizer-info"> + {summarizerModel} summarizer</span>
            )}
            <button 
              onClick={() => setShowConfig(true)}
              className="change-model-btn"
              title="Change model"
            >
              Change
            </button>
          </span>
        </div>
      );
    } else if (modelLoadStatus === "no model loaded") {
      return (
        <div className="model-status-container">
          <div className="status-icon-warning">!</div>
          <span className="status-text">No model loaded. Click <span role="img" aria-label="settings">⚙️</span> to configure.</span>
        </div>
      );
    }
  };

  // New helper to validate YouTube URLs with improved pattern
  const isValidYoutubeUrl = (url) => {
    if (!url || url.trim() === '') return false;
    
    // More comprehensive regex to handle various YouTube URL formats
    const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|v\/|embed\/|shorts\/)|youtu\.be\/)/;
    return pattern.test(url.trim());
  };

  // eslint-disable-next-line no-unused-vars
  const renderStatus = (status) => {
    const statusClass = `status-text ${status.toLowerCase()}`;
    let statusText;
    
    switch(status.toLowerCase()) {
      case 'queued':
        statusText = 'In Queue';
        break;
      case 'processing':
        statusText = 'Processing';
        break;
      case 'complete':
        statusText = 'Completed';
        break;
      case 'error':
        statusText = 'Failed';
        break;
      default:
        statusText = status;
    }
    
    return <span className={statusClass}>{statusText}</span>;
  };

  return (
    <div className="home-container">
      <div className="hero-section">
        <h1>EchoScript<span className="accent">AI</span></h1>
        <p className="subtitle">
          Transform videos into intelligent content with multilingual AI transcription
        </p>

        <form onSubmit={handleSubmit} className="url-form">
          <div className="input-group">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Enter YouTube URL to analyze..."
              className="url-input"
              disabled={isSubmitting || modelLoadStatus !== "loaded"}
            />
            <button
              type="submit"
              className="submit-button"
              disabled={isSubmitting || modelLoadStatus !== "loaded" || !isValidYoutubeUrl(youtubeUrl)}
            >
              {isSubmitting ? 'Processing...' : 'Analyze'}
            </button>
            <button 
              type="button" 
              className="config-button" 
              onClick={() => setShowConfig(true)}
              disabled={isSubmitting}
              title="Configure Model"
            >
              <FiSettings className="config-icon" />
            </button>
          </div>
          {error && <p className="error-message">{error}</p>}
        </form>

        {renderModelStatus()}
      </div>

      <div className="features-section">
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><FaFileAlt /></div>
            <h3>Advanced Transcription</h3>
            <p>State-of-the-art speech recognition with 50+ language support</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><FaChartBar /></div>
            <h3>Smart Analysis</h3>
            <p>AI-powered summary and key points extraction</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><FaClock /></div>
            <h3>Timestamped</h3>
            <p>Precise navigation with interactive timestamps</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><FaSave /></div>
            <h3>Export & Share</h3>
            <p>Notion integration and multiple export formats</p>
          </div>
        </div>
      </div>

      <div className="about-section">
        <p>
          <a href="https://github.com/Leptons1618" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span className="divider">•</span>
          <a href="https://www.linkedin.com/in/anish-giri-a4031723a/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <span className="divider">•</span>
          <a href="mailto:anishgiri163@gmail.com">Contact</a>
        </p>
      </div>

      {/* Configuration Modal */}
      {showConfig && (
        <div className="config-modal">
          <div className="config-modal-content">
            <div className="config-header">
              <h2>Model Configuration</h2>
              <p className="config-subtitle">Optimize transcription and summarization settings</p>
            </div>
            
            <div className="config-options">
              <div className="config-option model-type">
                <label>Model Engine</label>
                <select 
                  value={modelType} 
                  onChange={(e) => {
                    setModelType(e.target.value);
                    if (e.target.value !== modelType) {
                      setModelSize("tiny");
                    }
                  }}
                >
                  <option value="faster-whisper">Faster-Whisper (Optimized)</option>
                  <option value="whisper">Whisper (Original)</option>
                </select>
              </div>

              <div className="config-option model-size">
                <label>Model Size</label>
                <select 
                  value={modelSize} 
                  onChange={(e) => setModelSize(e.target.value)}
                >
                  {modelType === 'faster-whisper' ? (
                    <>
                      <option value="turbo">Turbo (Fastest)</option>
                      <option value="tiny">Tiny (Compact)</option>
                      <option value="base">Base (Balanced)</option>
                      <option value="small">Small (Improved)</option>
                      <option value="medium">Medium (Enhanced)</option>
                      <option value="large">Large (Best)</option>
                    </>
                  ) : (
                    <>
                      <option value="turbo">Turbo (Fastest)</option>
                      <option value="tiny">Tiny (Compact)</option>
                      <option value="base">Base (Balanced)</option>
                      <option value="small">Small (Improved)</option>
                      <option value="medium">Medium (Enhanced)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="config-option language-select">
                <label>Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={['hi', 'bn'].includes(language) ? 'specialized-language' : ''}
                >
                  <option value="auto">Auto-Detect Language</option>
                  <optgroup label="Specialized Support">
                    <option value="hi" className="specialized-option">Hindi (Enhanced)</option>
                    <option value="bn" className="specialized-option">Bengali (Enhanced)</option>
                  </optgroup>
                  <optgroup label="Common Languages">
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                  </optgroup>
                  <optgroup label="Other Languages">
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="nl">Dutch</option>
                    <option value="pl">Polish</option>
                    <option value="tr">Turkish</option>
                  </optgroup>
                </select>
              </div>

              <div className="config-option summarizer-select">
                <label>Summarizer</label>
                <select
                  value={summarizerModel}
                  onChange={(e) => setSummarizerModel(e.target.value)}
                  className={['ai4bharat/IndicBART', 'google/mt5-base'].includes(summarizerModel) ? 'specialized-language' : ''}
                >
                  <optgroup label="General Purpose">
                    <option value="facebook/bart-large-cnn">BART Large CNN (Best Quality)</option>
                    <option value="facebook/bart-large-xsum">BART XSum (Concise)</option>
                    <option value="google/pegasus-xsum">Pegasus (Enhanced)</option>
                  </optgroup>
                  <optgroup label="Language Specialized">
                    <option value="ai4bharat/IndicBART" className="specialized-option">IndicBART (Hindi Optimized)</option>
                    <option value="google/mt5-base" className="specialized-option">MT5 Base (Bengali Optimized)</option>
                  </optgroup>
                  <optgroup label="Multilingual">
                    <option value="facebook/mbart-large-50-one-to-many-mmt">mBART-50 (50 Languages)</option>
                  </optgroup>
                </select>
              </div>

              <div className="model-info-table">
                <table>
                  <thead>
                    <tr>
                      <th>Size</th>
                      <th>Quality</th>
                      <th>Speed</th>
                      <th>Memory</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Turbo</td>
                      <td>Good</td>
                      <td>Fastest</td>
                      <td>~1GB</td>
                    </tr>
                    <tr>
                      <td>Tiny</td>
                      <td>Basic</td>
                      <td>Very Fast</td>
                      <td>~1GB</td>
                    </tr>
                    <tr>
                      <td>Base</td>
                      <td>Good</td>
                      <td>Fast</td>
                      <td>~1GB</td>
                    </tr>
                    <tr>
                      <td>Small</td>
                      <td>Better</td>
                      <td>Medium</td>
                      <td>~2GB</td>
                    </tr>
                    <tr>
                      <td>Medium</td>
                      <td>Great</td>
                      <td>Slower</td>
                      <td>~5GB</td>
                    </tr>
                    {modelType === 'faster-whisper' && (
                      <tr>
                        <td>Large</td>
                        <td>Best</td>
                        <td>Slowest</td>
                        <td>~10GB</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="config-actions">
              <button className="config-close-button" onClick={() => setShowConfig(false)}>
                Cancel
              </button>
              <button className="config-save-button" onClick={saveConfig}>
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;