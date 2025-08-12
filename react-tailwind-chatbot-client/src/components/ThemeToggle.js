// src/components/ThemeToggle.js
import React from 'react';
import { useTheme } from '../contexts/ThemeContext'; // Adjust path as needed

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700 transition-colors duration-200"
      aria-label="Toggle dark mode"
    >
      {theme === 'dark' ? (
        // Sun icon for light mode (when current theme is dark)
        <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 14a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zm-6 0a1 1 0 01-1 1H4a1 1 0 110-2h1a1 1 0 011 1zM2 10a1 1 0 011-1h1a1 1 0 110 2H3a1 1 0 01-1-1zm15 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM7.707 4.293a1 1 0 010 1.414L6.293 7.707a1 1 0 01-1.414-1.414l1.414-1.414a1 1 0 011.414 0zM14.707 12.293a1 1 0 010 1.414l-1.414 1.414a1 1 0 01-1.414-1.414l1.414-1.414a1 1 0 011.414 0zM12.293 4.293a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414l-1.414-1.414a1 1 0 010-1.414zM5.293 12.293a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414l-1.414-1.414a1 1 0 010-1.414z"
          ></path>
        </svg>
      ) : (
        // Moon icon for dark mode (when current theme is light)
        <svg className="w-6 h-6 text-gray-800" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
        </svg>
      )}
    </button>
  );
};

export default ThemeToggle;