import React from 'react';
import { ChevronDown, Moon, Sun, Palette, Search, ArrowLeftRight } from 'lucide-react';
import type { Project } from '../types';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  currentProject: Project | null;
  onOpenProjectDrawer: () => void;
  onOpenThemeModal: () => void;
  onOpenSyncVaultModal?: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  showSearch: boolean;
  onToggleSearch: () => void;
  isProjectDrawerOpen?: boolean;
  isGlobalSearch: boolean;
  onToggleGlobalSearch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentProject,
  onOpenProjectDrawer,
  onOpenThemeModal,
  onOpenSyncVaultModal,
  searchQuery,
  onSearchChange,
  showSearch,
  onToggleSearch,
  isProjectDrawerOpen,
  isGlobalSearch,
  onToggleGlobalSearch,
}) => {
  const { isDark, toggleDarkMode } = useTheme();

  return (
    <header
      className="sticky top-0 z-30 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-slate-200/70 dark:border-zinc-800/80 transition-colors shadow-xs"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)',
      }}
    >
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        {/* Project Selector - Refactored for clean hierarchy & depth */}
        <button
          onClick={onOpenProjectDrawer}
          className="touch-press flex items-center gap-2.5 px-3 py-1.5 -ml-1 rounded-xl bg-slate-100/80 dark:bg-zinc-800/70 border border-slate-200/60 dark:border-zinc-700/60 hover:bg-slate-200/60 dark:hover:bg-zinc-700/60 transition-all text-left group shadow-2xs"
          title="点击切换项目空间"
        >
          <span
            className="w-3 h-3 rounded-full ring-2 ring-white dark:ring-zinc-900 shadow-xs shrink-0 transition-transform group-hover:scale-110"
            style={{ backgroundColor: currentProject?.color || 'var(--theme-primary)' }}
          />
          <div className="flex flex-col justify-center min-w-0">
            <span className="text-[10px] text-slate-400 dark:text-zinc-400 font-semibold tracking-wider uppercase leading-none mb-0.5">
              当前项目
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-zinc-100 tracking-tight truncate max-w-[140px] sm:max-w-[240px]">
                {currentProject?.name || '所有项目'}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 group-hover:text-theme transition-transform duration-200 shrink-0 ${
                  isProjectDrawerOpen ? 'rotate-180 text-theme' : ''
                }`}
              />
            </div>
          </div>
        </button>

        {/* Right Action Icons - Consistent 36x36px target boxes with subtle borders */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Search Button */}
          <button
            onClick={onToggleSearch}
            className={`touch-press w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              showSearch
                ? 'bg-theme/15 text-theme ring-1 ring-theme/30'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
            title="搜索便签"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Dark Mode Switcher */}
          <button
            onClick={toggleDarkMode}
            className="touch-press w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
            title={isDark ? '切换到浅色模式' : '切换到深色模式'}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400 transition-transform rotate-0 hover:rotate-90" />
            ) : (
              <Moon className="w-4 h-4 transition-transform hover:-rotate-12" />
            )}
          </button>

          {/* Theme Color Picker Modal Button */}
          <button
            onClick={onOpenThemeModal}
            className="touch-press w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
            title="自定义主题色"
          >
            <Palette className="w-4 h-4 text-theme" />
          </button>

          {/* Sync & Vault Modal Button */}
          {onOpenSyncVaultModal && (
            <button
              onClick={onOpenSyncVaultModal}
              className="touch-press w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
              title="电脑手机互联与外部存储"
            >
              <ArrowLeftRight className="w-4 h-4 text-theme" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable Search Input Bar with Refined Segmented Control */}
      {showSearch && (
        <div className="px-4 pb-3.5 pt-1 max-w-4xl mx-auto animate-fade-scale space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={isGlobalSearch ? "全局搜索所有项目的便签标题或正文..." : "搜索当前项目便签标题或正文..."}
              autoFocus
              className="w-full pl-9 pr-14 py-2 text-xs sm:text-sm rounded-xl bg-slate-100/90 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/80 focus:outline-none focus:ring-2 focus:ring-theme/30 focus:border-theme/60 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="touch-press absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 font-medium hover:bg-slate-300 dark:hover:bg-zinc-600 transition-colors"
              >
                清除
              </button>
            )}
          </div>

          {/* Refactoring UI: Segmented Control with Clean Sliding Contrast */}
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">搜索范围：</span>
            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200/60 dark:border-zinc-700/60 text-[11px] font-medium shadow-2xs">
              <button
                onClick={() => isGlobalSearch && onToggleGlobalSearch()}
                className={`touch-press px-2.5 py-1 rounded-md transition-all ${
                  !isGlobalSearch
                    ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 shadow-xs font-semibold'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'
                }`}
              >
                当前项目
              </button>
              <button
                onClick={() => !isGlobalSearch && onToggleGlobalSearch()}
                className={`touch-press px-2.5 py-1 rounded-md transition-all ${
                  isGlobalSearch
                    ? 'bg-white dark:bg-zinc-900 text-theme dark:text-theme shadow-xs font-semibold'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300'
                }`}
              >
                🌐 全部项目
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
