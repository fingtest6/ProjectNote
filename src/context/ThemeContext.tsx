import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ThemeConfig, ThemeMode } from '../types';
import { DEFAULT_THEME, THEME_PRESETS, applyThemeVariables } from '../utils/theme';

interface ThemeContextType {
  theme: ThemeConfig;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  setPrimaryColor: (color: string) => void;
  setPreset: (presetId: string) => void;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = 'project_notes_theme_config';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return DEFAULT_THEME;
  });

  const [systemDark, setSystemDark] = useState<boolean>(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const isDark = theme.mode === 'dark' || (theme.mode === 'system' && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    applyThemeVariables(theme, isDark);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch {
      // ignore
    }
  }, [theme, isDark]);

  const setMode = (mode: ThemeMode) => {
    setTheme(prev => ({ ...prev, mode }));
  };

  const setPrimaryColor = (color: string) => {
    setTheme(prev => ({ ...prev, primaryColor: color, presetId: 'custom' }));
  };

  const setPreset = (presetId: string) => {
    const preset = THEME_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setTheme(prev => ({ ...prev, presetId, primaryColor: preset.color }));
    }
  };

  const toggleDarkMode = () => {
    setTheme(prev => ({
      ...prev,
      mode: isDark ? 'light' : 'dark',
    }));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        setMode,
        setPrimaryColor,
        setPreset,
        toggleDarkMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
