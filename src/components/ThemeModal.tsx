import React from 'react';
import { X, Palette, Sun, Moon, Laptop, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { THEME_PRESETS } from '../utils/theme';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeModal: React.FC<ThemeModalProps> = ({ isOpen, onClose }) => {
  const { theme, setMode, setPreset, setPrimaryColor } = useTheme();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-scale">
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200/80 dark:border-zinc-800 flex flex-col animate-slide-up-spring"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-theme" />
            <h3 className="font-semibold text-base text-slate-800 dark:text-zinc-100">
              个性化主题与色彩
            </h3>
          </div>
          <button
            onClick={onClose}
            className="touch-press w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-5 overflow-y-auto">
          {/* Mode Selection */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
              外观模式
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setMode('light')}
                className={`touch-press py-2.5 px-2 rounded-xl flex flex-col items-center gap-1.5 border transition-all ${
                  theme.mode === 'light'
                    ? 'border-theme bg-theme/10 text-theme font-semibold ring-1 ring-theme/20'
                    : 'border-slate-200/80 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span className="text-xs">浅色模式</span>
              </button>

              <button
                onClick={() => setMode('dark')}
                className={`touch-press py-2.5 px-2 rounded-xl flex flex-col items-center gap-1.5 border transition-all ${
                  theme.mode === 'dark'
                    ? 'border-theme bg-theme/10 text-theme font-semibold ring-1 ring-theme/20'
                    : 'border-slate-200/80 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span className="text-xs">纯黑深色</span>
              </button>

              <button
                onClick={() => setMode('system')}
                className={`touch-press py-2.5 px-2 rounded-xl flex flex-col items-center gap-1.5 border transition-all ${
                  theme.mode === 'system'
                    ? 'border-theme bg-theme/10 text-theme font-semibold ring-1 ring-theme/20'
                    : 'border-slate-200/80 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span className="text-xs">跟随系统</span>
              </button>
            </div>
          </div>

          {/* Theme Accent Color */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                主题强调色
              </label>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full shadow-xs ring-1 ring-black/10"
                  style={{ backgroundColor: theme.primaryColor }}
                />
                <span className="text-xs font-mono text-slate-500 font-semibold">
                  {theme.primaryColor.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {THEME_PRESETS.map((p) => {
                const isSelected = theme.presetId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPreset(p.id)}
                    className={`touch-press py-2 px-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                      isSelected
                        ? 'border-slate-800 dark:border-white shadow-xs ring-1 ring-slate-400/30'
                        : 'border-slate-200/80 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white shadow-xs"
                      style={{ backgroundColor: p.color }}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
                      {p.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Color Picker */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-800">
              <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                自定义任意颜色
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-0"
                />
                <span className="text-xs text-slate-400 font-mono">
                  {theme.primaryColor}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-100 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="touch-press w-full py-2.5 rounded-xl bg-theme text-white font-medium text-xs sm:text-sm hover:brightness-95 shadow-sm active:scale-98 transition-all"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
