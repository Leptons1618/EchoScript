import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';
import { FiUser, FiLock, FiAlertCircle, FiEye, FiEyeOff, FiLoader } from 'react-icons/fi';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check for redirected message from signup
  useEffect(() => {
    if (location.state?.message) {
      // This could be a success message after signup
      setError(location.state.message);
    }
  }, [location]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const result = await login(username, password, rememberMe);
      
      if (result.success) {
        // Get intended destination from location state, or default to home
        const from = location.state?.from?.pathname || '/';
        navigate(from, { replace: true });
      } else {
        setError(result.message || 'Invalid username or password. Please try again.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again later.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Welcome Back</h1>
        <p>Sign in to your account to continue</p>
      </div>
      
      <form className="auth-form" onSubmit={handleSubmit} autoComplete="off">
        {error && (
          <div className="alert alert-error">
            <FiAlertCircle />&nbsp;{error}
          </div>
        )}
        
        <div className="form-group">
          <label htmlFor="username" className="form-label">Username</label>
          <div className="input-group">
            <FiUser className="input-icon" />
            <input
              id="username"
              type="text"
              className="form-control input-with-icon"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              autoFocus
            />
          </div>
        </div>
        
        <div className="form-group">
          <label htmlFor="password" className="form-label">Password</label>
          <div className="input-group">
            <FiLock className="input-icon" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className="form-control input-with-icon"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
            />
            <button 
              type="button"
              className="password-toggle"
              onClick={togglePasswordVisibility}
              tabIndex="-1"
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
          <div className="form-options">
            <div className="remember-me-container">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={() => setRememberMe(!rememberMe)}
                disabled={isLoading}
              />
              <label htmlFor="rememberMe">Remember me</label>
            </div>
            <Link to="/forgot-password" className="forgot-link">
              Forgot password?
            </Link>
          </div>
        </div>
        
        <div className="form-group">
          {isLoading ? (
            <button type="button" className="btn btn-loading" disabled>
              <FiLoader className="btn-spinner" /> Signing In...
            </button>
          ) : (
            <button type="submit" className="btn">Sign In</button>
          )}
        </div>
      </form>
      
      <div className="auth-link">
        Don't have an account? <Link to="/signup">Create account</Link>
      </div>
    </div>
  );
};

export default Login;