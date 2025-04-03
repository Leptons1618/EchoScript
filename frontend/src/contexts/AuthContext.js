import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Check if user is already logged in (session exists)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/auth/check', { 
          withCredentials: true 
        });
        if (response.data.authenticated) {
          setUser(response.data.user);
        }
      } catch (error) {
        console.error('Authentication check failed:', error);
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  // Login function
  const login = async (username, password) => {
    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', { 
        username, 
        password 
      }, { 
        withCredentials: true 
      });
      
      if (response.data.success) {
        setUser(response.data.user);
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
        return { success: true };
      }
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Signup failed' 
      };
    }
  };
  
  // Logout function
  const logout = async () => {
    try {
      await axios.post('http://localhost:5000/api/auth/logout', {}, { 
        withCredentials: true 
      });
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };
  
  const value = {
    user,
    loading,
    login,
    signup,
    logout,
    isAuthenticated: !!user
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