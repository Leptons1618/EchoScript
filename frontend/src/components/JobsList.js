// src/components/JobsList.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './JobsList.css';

const JobsList = () => {
  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortMethod, setSortMethod] = useState('newest');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/jobs');
        if (response.ok) {
          const data = await response.json();
          setJobs(data.jobs);
          setFilteredJobs(data.jobs);
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

  // Handle filtering jobs based on criteria
  useEffect(() => {
    if (!jobs.length) return;

    // Create a copy to filter
    let result = [...jobs];

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(job => job.status === statusFilter);
    }

    // Apply date range filter
    if (startDate) {
      const start = new Date(startDate).getTime() / 1000; // Convert to unix timestamp
      result = result.filter(job => job.created_at >= start);
    }

    if (endDate) {
      const end = new Date(endDate).getTime() / 1000 + 86400; // Add a day to include the end date
      result = result.filter(job => job.created_at <= end);
    }

    // Apply search query (case-insensitive)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(job => job.title?.toLowerCase().includes(query));
      
      // If we have full text search from API, we could add it here
      // This would require backend support for text search in transcripts
    }

    // Apply sorting
    switch (sortMethod) {
      case 'oldest':
        result.sort((a, b) => a.created_at - b.created_at);
        break;
      case 'a-z':
        result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'z-a':
        result.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
        break;
      case 'newest':
      default:
        result.sort((a, b) => b.created_at - a.created_at);
    }

    setFilteredJobs(result);
  }, [jobs, searchQuery, statusFilter, sortMethod, startDate, endDate]);
  
  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSortMethod('newest');
    setStartDate('');
    setEndDate('');
  };

  // Handle keyboard shortcuts for search
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      // The filtering happens automatically through the useEffect
      e.preventDefault();
    } else if (e.key === 'Escape') {
      resetFilters();
    }
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
      
      {/* Search and Filter Controls */}
      <div className="filter-controls">
        <div className="search-container">
          <input 
            type="text" 
            placeholder="Search by title... (Enter to search, Esc to reset)" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="search-input"
          />
          <button className="search-button" title="Search (Enter)">
            <span role="img" aria-label="search">🔍</span>
          </button>
        </div>
        
        <div className="filter-options">
          <div className="filter-group">
            <label>Status:</label>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All</option>
              <option value="complete">Completed</option>
              <option value="downloading">Downloading</option>
              <option value="transcribing">Transcribing</option>
              <option value="generating_notes">Generating Notes</option>
              <option value="error">Failed</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Sort by:</label>
            <select 
              value={sortMethod} 
              onChange={(e) => setSortMethod(e.target.value)}
              className="filter-select"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="a-z">A-Z</option>
              <option value="z-a">Z-A</option>
            </select>
          </div>
        </div>
        
        <div className="date-filter">
          <div className="filter-group">
            <label>From:</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="date-input"
            />
          </div>
          <div className="filter-group">
            <label>To:</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="date-input"
            />
          </div>
        </div>
        
        <button 
          onClick={resetFilters}
          className="reset-filters-button"
        >
          Reset Filters
        </button>
      </div>
      
      {/* Results Summary */}
      <div className="results-info">
        <span>Showing {filteredJobs.length} of {jobs.length} transcriptions</span>
      </div>
      
      {/* Jobs Grid */}
      <div className="jobs-grid">
        {filteredJobs.length > 0 ? (
          filteredJobs.map((job) => (
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
        ) : (
          <div className="no-results">
            <p>No transcriptions match your search filters.</p>
            <button onClick={resetFilters} className="reset-button">Reset Filters</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobsList;