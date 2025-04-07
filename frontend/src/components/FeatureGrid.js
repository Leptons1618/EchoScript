import React from 'react';
import './FeatureGrid.css';
import { FiVideo, FiFileText, FiCpu, FiGlobe, FiSave, FiShare2 } from 'react-icons/fi';

const FeatureGrid = () => {
  const features = [
    {
      icon: <FiVideo />,
      title: 'YouTube Video Transcription',
      description: 'Automatically transcribe any YouTube video with high accuracy using state-of-the-art AI models.'
    },
    {
      icon: <FiFileText />,
      title: 'Intelligent Summarization',
      description: 'Generate concise summaries and key points from lengthy video content to save you time.'
    },
    {
      icon: <FiCpu />,
      title: 'Multiple AI Models',
      description: 'Choose from different transcription and summarization models to optimize for speed or accuracy.'
    },
    {
      icon: <FiGlobe />,
      title: 'Multi-language Support',
      description: 'Process videos in multiple languages with automatic language detection capabilities.'
    },
    {
      icon: <FiSave />,
      title: 'Save & Export',
      description: 'Save transcripts and summaries to your personal library and export them in various formats.'
    },
    {
      icon: <FiShare2 />,
      title: 'Share & Collaborate',
      description: 'Easily share your transcriptions or export them directly to Notion for collaborative work.'
    }
  ];

  return (
    <div className="feature-grid">
      {features.map((feature, index) => (
        <div className="feature-card" key={index}>
          <div className="feature-content">
            <div className="feature-icon">
              {feature.icon}
            </div>
            <h3 className="feature-title">{feature.title}</h3>
            <p className="feature-description">{feature.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FeatureGrid;
