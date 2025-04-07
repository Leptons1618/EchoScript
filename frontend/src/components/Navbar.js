// src/components/Navbar.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './Navbar.css';
// Import sun and moon icons
import { FiSun, FiMoon, FiLogOut, FiUser, FiUserPlus } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
  const [theme, setTheme] = useState('light');
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Load theme from config when component mounts
  useEffect(() => {
    fetch('http://localhost:5000/api/config', {
      credentials: 'include' // Include cookies in the request
    })
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
    
    // Save theme preference to server with credentials
    fetch('http://localhost:5000/api/save_theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies
      body: JSON.stringify({ theme: newTheme })
    }).catch(err => console.error("Error saving theme:", err));
  };
  
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };
  
  // Determine if we're on login or signup page
  const isLoginPage = location.pathname === '/login';
  const isSignupPage = location.pathname === '/signup';
  const isAuthPage = isLoginPage || isSignupPage;

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
          <>
            {isLoginPage ? (
              <Link to="/signup" className="navbar-item auth-nav-item">
                <FiUserPlus className="nav-icon" />
                Create Account
              </Link>
            ) : isSignupPage ? (
              <Link to="/login" className="navbar-item auth-nav-item">
                <FiUser className="nav-icon" />
                Login
              </Link>
            ) : (
              <>
                <Link to="/login" className="navbar-item">Login</Link>
                <Link to="/signup" className="navbar-item auth-nav-item">
                  <FiUserPlus className="nav-icon" />
                  Sign Up
                </Link>
              </>
            )}
          </>
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