import type { ThemeConfig } from '../types';

export interface ThemePreset {
  id: string;
  name: string;
  color: string;
  hover: string;
  softLight: string;
  softDark: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'emerald',
    name: '极光绿',
    color: '#10b981',
    hover: '#059669',
    softLight: '#ecfdf5',
    softDark: 'rgba(16, 185, 129, 0.15)',
  },
  {
    id: 'sapphire',
    name: '克莱因蓝',
    color: '#3b82f6',
    hover: '#2563eb',
    softLight: '#eff6ff',
    softDark: 'rgba(59, 130, 246, 0.15)',
  },
  {
    id: 'violet',
    name: '晚霞紫',
    color: '#8b5cf6',
    hover: '#7c3aed',
    softLight: '#f5f3ff',
    softDark: 'rgba(139, 92, 246, 0.15)',
  },
  {
    id: 'sunset',
    name: '落日橙',
    color: '#f97316',
    hover: '#ea580c',
    softLight: '#fff7ed',
    softDark: 'rgba(249, 115, 22, 0.15)',
  },
  {
    id: 'rose',
    name: '胭脂粉',
    color: '#f43f5e',
    hover: '#e11d48',
    softLight: '#fff1f2',
    softDark: 'rgba(244, 63, 94, 0.15)',
  },
  {
    id: 'amber',
    name: '琥珀金',
    color: '#d97706',
    hover: '#b45309',
    softLight: '#fffbeb',
    softDark: 'rgba(217, 119, 6, 0.15)',
  },
  {
    id: 'cyan',
    name: '薄荷青',
    color: '#06b6d4',
    hover: '#0891b2',
    softLight: '#ecfeff',
    softDark: 'rgba(6, 182, 212, 0.15)',
  },
  {
    id: 'slate',
    name: '极简灰',
    color: '#64748b',
    hover: '#475569',
    softLight: '#f8fafc',
    softDark: 'rgba(100, 116, 139, 0.15)',
  },
];

export const DEFAULT_THEME: ThemeConfig = {
  mode: 'system',
  primaryColor: '#10b981',
  presetId: 'emerald',
};

// Convert hex to rgb
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Generate CSS variables from theme
export function applyThemeVariables(config: ThemeConfig, isDark: boolean) {
  const root = document.documentElement;
  const rgb = hexToRgb(config.primaryColor);

  if (rgb) {
    root.style.setProperty('--theme-primary', config.primaryColor);
    root.style.setProperty(
      '--theme-hover',
      `rgb(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)})`
    );
    root.style.setProperty(
      '--theme-soft',
      isDark
        ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`
        : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`
    );
    root.style.setProperty(
      '--theme-ring',
      `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`
    );
  }
}
