// src/auth/AuthProvider.js
import React, { createContext, useContext, useState, useEffect } from 'react';

// Create the context
const AuthContext = createContext();

// Provider component
export function AuthProvider({ children }) {
  // pull token from localStorage (or null)
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  // on token change, sync to localStorage
  useEffect(() => {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }, [token]);

  const login = (jwt) => setToken(jwt);
  const logout = () => setToken(null);

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth() {
  return useContext(AuthContext);
}
