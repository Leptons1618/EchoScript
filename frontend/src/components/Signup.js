import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Signup.css';
import { FiUser, FiMail, FiLock, FiAlertCircle, FiEye, FiEyeOff, FiLoader, FiCheck, FiX } from 'react-icons/fi';

const Signup = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { signup } = useAuth();
  const navigate = useNavigate();
  
  // Password validation
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password === confirmPassword;
  
  const getPasswordStrength = () => {
    if (!password) return '';
    
    let strength = 0;
    if (hasMinLength) strength++;
    if (hasUppercase) strength++;
    if (hasLowercase) strength++;
    if (hasNumber) strength++;
    
    if (strength <= 2) return 'weak';
    if (strength === 3) return 'medium';
    return 'strong';
  };
  
  const passwordStrength = getPasswordStrength();
  
  // Email validation
  const isEmailValid = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return !email || emailRegex.test(email);
  };
  
  // Username validation
  const isUsernameValid = () => {
    return !username || (username.length >= 3 && /^[a-zA-Z0-9_]+$/.test(username));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate inputs
    if (!username || !email || !password) {
      setError('All fields are required');
      return;
    }
    
    if (!isEmailValid()) {
      setError('Please enter a valid email address');
      return;
    }
    
    if (!isUsernameValid()) {
      setError('Username must be at least 3 characters and can only contain letters, numbers and underscores');
      return;
    }
    
    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasNumber) {
      setError('Password does not meet the requirements');
      return;
    }
    
    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const result = await signup(username, email, password);
      
      if (result.success) {
        navigate('/', { replace: true });
      } else {
        setError(result.message || 'Failed to create an account. Please try again.');
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
        <h1>Create an Account</h1>
        <p>Sign up to get started with EchoScript</p>
      </div>
      
      <form className="auth-form" onSubmit={handleSubmit}>
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
              placeholder="Choose a username"
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
          {username && !isUsernameValid() && (
            <div className="input-feedback" style={{color: 'var(--color-error)'}}>
              <FiX /> Username must be at least 3 characters (letters, numbers, underscores only)
            </div>
          )}
        </div>
        
        <div className="form-group">
          <label htmlFor="email" className="form-label">Email</label>
          <div className="input-group">
            <FiMail className="input-icon" />
            <input
              id="email"
              type="email"
              className="form-control input-with-icon"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
          {email && !isEmailValid() && (
            <div className="input-feedback" style={{color: 'var(--color-error)'}}>
              <FiX /> Please enter a valid email address
            </div>
          )}
        </div>
        
        <div className="form-group">
          <label htmlFor="password" className="form-label">Password</label>
          <div className="input-group">
            <FiLock className="input-icon" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className="form-control input-with-icon"
              placeholder="Create a password"
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
          
          {password && (
            <>
              <div className="strength-meter">
                <div className={`strength-meter-bar ${passwordStrength}`}></div>
              </div>
              <div style={{fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem'}}>
                Password Strength: {passwordStrength.charAt(0).toUpperCase() + passwordStrength.slice(1)}
              </div>
              
              <div className={`requirement ${hasMinLength ? 'valid' : 'invalid'}`}>
                {hasMinLength ? <FiCheck /> : <FiX />} At least 8 characters
              </div>
              <div className={`requirement ${hasUppercase ? 'valid' : 'invalid'}`}>
                {hasUppercase ? <FiCheck /> : <FiX />} At least one uppercase letter
              </div>
              <div className={`requirement ${hasLowercase ? 'valid' : 'invalid'}`}>
                {hasLowercase ? <FiCheck /> : <FiX />} At least one lowercase letter
              </div>
              <div className={`requirement ${hasNumber ? 'valid' : 'invalid'}`}>
                {hasNumber ? <FiCheck /> : <FiX />} At least one number
              </div>
            </>
          )}
        </div>
        
        <div className="form-group">
          <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
          <div className="input-group">
            <FiLock className="input-icon" />
            <input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              className="form-control input-with-icon"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
            />
          </div>
          
          {confirmPassword && (
            <div className={`requirement ${passwordsMatch ? 'valid' : 'invalid'}`}>
              {passwordsMatch ? <FiCheck /> : <FiX />} Passwords match
            </div>
          )}
        </div>
        
        <div className="form-group">
          {isLoading ? (
            <button type="button" className="btn btn-loading" disabled>
              <FiLoader className="btn-spinner" /> Creating Account...
            </button>
          ) : (
            <button 
              type="submit" 
              className="btn" 
              disabled={!username || !email || !password || !confirmPassword || !isEmailValid() || !isUsernameValid() || !passwordsMatch || !hasMinLength || !hasUppercase || !hasLowercase || !hasNumber}
            >
              Create Account
            </button>
          )}
        </div>
      </form>
      
      <div className="auth-link">
        Already have an account? <Link to="/login">Sign In</Link>
      </div>
    </div>
  );
};

export default Signup;