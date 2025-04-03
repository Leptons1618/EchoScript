// src/components/Navbar.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Navbar.css';
// Import sun and moon icons
import { FiSun, FiMoon, FiLogOut, FiUser } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
  const [theme, setTheme] = useState('light');
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
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
  
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/" className="logo">
          Echo<span className="logo-accent">Script</span>
        </Link>
      </div>
      <div className="navbar-menu">
        {isAuthenticated ? (
          <>
            <Link to="/" className="navbar-item">Dashboard</Link>
            <Link to="/jobs" className="navbar-item">Library</Link>
            <div className="user-menu">
              <span className="username">
                <FiUser className="user-icon" />
                {user?.username}
              </span>
              <button 
                className="logout-button" 
                onClick={handleLogout}
                title="Logout"
              >
                <FiLogOut />
              </button>
            </div>
          </>
        ) : (
          <Link to="/login" className="navbar-item">Login</Link>
        )}
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