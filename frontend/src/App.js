// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Navbar from './components/Navbar';
import TranscriptionView from './components/TranscriptionView';
import JobsList from './components/JobsList';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/jobs" element={<JobsList />} />
            <Route path="/view/:jobId" element={<TranscriptionView />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;