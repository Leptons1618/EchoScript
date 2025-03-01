// src/components/JobsList.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './JobsList.css';

const JobsList = () => {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/jobs');
        if (response.ok) {
          const data = await response.json();
          setJobs(data.jobs);
        } else {
          setError('Failed to fetch jobs');
        }
      } catch (err) {
        setError('Error connecting to server');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchJobs();
  }, []);
  
  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };
  
  if (isLoading) {
    return (
      <div className="jobs-loading">
        <div className="spinner"></div>
        <p>Loading your transcriptions...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="jobs-error">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }
  
  if (jobs.length === 0) {
    return (
      <div className="no-jobs">
        <h2>No Transcriptions Yet</h2>
        <p>Go to the home page to transcribe your first YouTube video.</p>
        <Link to="/" className="start-button">Start Transcribing</Link>
      </div>
    );
  }
  
  return (
    <div className="jobs-list">
      <h2>My Transcriptions</h2>
      
      <div className="jobs-grid">
        {
          // create a new sorted array to avoid mutating the state directly
          [...jobs].sort((a, b) => b.created_at - a.created_at).map((job) => (
            <Link to={`/view/${job.job_id}`} key={job.job_id} className="job-card">
              <div className="job-status">
                <span className={`status-indicator ${job.status}`}></span>
                {job.status === 'complete' ? 'Completed' : 
                 job.status === 'error' ? 'Failed' : 'Processing'}
              </div>
              <h3 className="job-title">{job.title || 'Unknown Video'}</h3>
              <div className="job-created">{formatDate(job.created_at)}</div>
            </Link>
          ))
        }
      </div>
    </div>
  );
};

export default JobsList;