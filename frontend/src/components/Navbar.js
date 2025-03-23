// src/components/Navbar.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';
// Import sun and moon icons
import { FiSun, FiMoon } from 'react-icons/fi';

const Navbar = () => {
  const [theme, setTheme] = useState('light');
  
  // Load theme from config when component mounts
  useEffect(() => {
    fetch('http://localhost:5000/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.theme) {
          setTheme(data.theme);
          document.body.className = data.theme;
        }
      })
      .catch(err => console.error("Error loading theme:", err));
  }, []);
  
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.body.className = newTheme;
    
    // Save theme preference to server
    fetch('http://localhost:5000/api/save_theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme })
    }).catch(err => console.error("Error saving theme:", err));
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/" className="logo">
          Echo<span className="logo-accent">Script</span>
        </Link>
      </div>
      <div className="navbar-menu">
        <Link to="/" className="navbar-item">Dashboard</Link>
        <Link to="/jobs" className="navbar-item">Library</Link>
        <button 
          className="theme-toggle" 
          onClick={toggleTheme} 
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <FiMoon /> : <FiSun />}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;