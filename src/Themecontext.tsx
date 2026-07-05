// @ts-nocheck
import React, { createContext, useState, useContext } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    // Salvar preferência no localStorage
    localStorage.setItem('darkMode', JSON.stringify(!isDarkMode));
  };

  const theme = {
    isDark: isDarkMode,
    colors: {
      // Backgrounds
      bg: {
        primary: isDarkMode ? '#1a1a1a' : '#ffffff',
        secondary: isDarkMode ? '#2d2d2d' : '#f9f9f9',
        tertiary: isDarkMode ? '#3a3a3a' : '#f0f0f0',
      },
      // Text
      text: {
        primary: isDarkMode ? '#e5e5e5' : '#1a3a52',
        secondary: isDarkMode ? '#b0b0b0' : '#666666',
        tertiary: isDarkMode ? '#808080' : '#999999',
      },
      // Borders
      border: isDarkMode ? '#404040' : '#e0e0e0',
      borderLight: isDarkMode ? '#2d2d2d' : '#f0f0f0',
      // Accent colors (não mudam)
      accent: '#22c55e',
      danger: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      primary: '#1a3a52',
    },
  };

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  }
  return context;
};
