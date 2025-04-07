import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userPreferences, setUserPreferences] = useState({});
  
  // Check if user is already logged in (session exists)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/auth/check', { 
          withCredentials: true 
        });
        
        if (response.data.authenticated) {
          setUser(response.data.user);
          
          // Store user preferences if available
          if (response.data.preferences) {
            setUserPreferences(response.data.preferences);
            
            // Apply theme from preferences
            if (response.data.preferences.theme) {
              document.body.className = response.data.preferences.theme;
            }
          }
        } else {
          // Even if not authenticated, apply default theme
          const defaultTheme = response.data.default_theme || 'light';
          document.body.className = defaultTheme;
        }
      } catch (error) {
        console.error('Authentication check failed:', error);
        // Set default theme on error
        document.body.className = 'light';
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  // Login function with remember me option
  const login = async (username, password, rememberMe = false) => {
    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', { 
        username, 
        password,
        rememberMe 
      }, { 
        withCredentials: true 
      });
      
      if (response.data.success) {
        setUser(response.data.user);
        
        // Store user preferences if available in response
        if (response.data.preferences) {
          setUserPreferences(response.data.preferences);
          
          // Apply theme from preferences
          if (response.data.preferences.theme) {
            document.body.className = response.data.preferences.theme;
          }
        }
        
        return { success: true };
      }
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Login failed' 
      };
    }
  };
  
  // Signup function
  const signup = async (username, email, password) => {
    try {
      const response = await axios.post('http://localhost:5000/api/auth/signup', { 
        username, 
        email, 
        password 
      }, { 
        withCredentials: true 
      });
      
      if (response.data.success) {
        setUser(response.data.user);
        
        // Store user preferences if available in response
        if (response.data.preferences) {
          setUserPreferences(response.data.preferences);
        }
        
        return { success: true };
      }
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Signup failed' 
      };
    }
  };
  
  // Logout function with model config clearing
  const logout = async () => {
    try {
      // First clear the model configuration
      const clearResponse = await fetch('http://localhost:5000/api/clear_model_config', {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!clearResponse.ok) {
        console.warn("Failed to clear model configuration cookies");
      } else {
        console.log("Model configuration cookies cleared successfully");
      }
      
      // Then proceed with normal logout
      await axios.post('http://localhost:5000/api/auth/logout', {}, { 
        withCredentials: true 
      });
      setUser(null);
      setUserPreferences({});
    } catch (error) {
      console.error('Logout failed:', error);
      // Still clear local state even if logout API fails
      setUser(null);
      setUserPreferences({});
    }
  };
  
  // Update user preferences
  const updatePreferences = (newPreferences) => {
    setUserPreferences(prev => ({
      ...prev,
      ...newPreferences
    }));
  };
  
  const value = {
    user,
    loading,
    login,
    signup,
    logout,
    isAuthenticated: !!user,
    userPreferences,
    updatePreferences
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};