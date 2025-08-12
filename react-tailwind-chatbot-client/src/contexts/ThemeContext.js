// src/contexts/ThemeContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

// Define the shape of our context value
const ThemeContext = createContext({
  theme: 'light', // Default theme
  toggleTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
  // Initialize theme from localStorage or default to 'light'
  // and check system preference if no localStorage value exists
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') { // Check if window is defined (for SSR compatibility)
      const storedTheme = localStorage.getItem('theme');
      if (storedTheme) {
        return storedTheme;
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light'; // Default for SSR
  });

  // Effect to apply the 'dark' class to the HTML element
  // and save the preference to localStorage
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Function to toggle the theme
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Custom hook to easily consume the theme context
export const useTheme = () => useContext(ThemeContext);