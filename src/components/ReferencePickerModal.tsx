import React, { useState, useMemo } from 'react';
import { X, Search, Link2 } from 'lucide-react';
import type { Note, Project } from '../types';
import { getPlainTextSnippet } from '../utils/markdown';

interface ReferencePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  projects: Project[];
  currentNoteId?: string;
  onSelectNote: (note: Note) => void;
}

export const ReferencePickerModal: React.FC<ReferencePickerModalProps> = ({
  isOpen,
  onClose,
  notes,
  projects,
  currentNoteId,
  onSelectNote,
}) => {
  const [query, setQuery] = useState('');

  const projectMap = useMemo(() => {
    return new Map(projects.map((p) => [p.id, p]));
  }, [projects]);

  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => n.id !== currentNoteId)
      .filter((n) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
        );
      });
  }, [notes, currentNoteId, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-scale">
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-200/80 dark:border-zinc-800 flex flex-col max-h-[85vh] animate-slide-up-spring"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Safe Area */}
        <div
          className="px-5 py-3 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          }}
        >
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-theme" />
            <h3 className="font-semibold text-base text-slate-800 dark:text-zinc-100">
              插入便签引用
            </h3>
          </div>
          <button
            onClick={onClose}
            className="touch-press w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-850/40">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索要引用的便签标题或正文..."
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-white dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-theme/30 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filteredNotes.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              未找到匹配的便签
            </div>
          ) : (
            filteredNotes.map((n) => {
              const project = projectMap.get(n.projectId);
              const snippet = getPlainTextSnippet(n.content, 90);

              return (
                <div
                  key={n.id}
                  onClick={() => {
                    onSelectNote(n);
                    onClose();
                  }}
                  className="touch-press p-3 rounded-xl border border-slate-200/60 dark:border-zinc-800 hover:border-theme/40 hover:bg-theme/5 dark:hover:bg-theme/10 cursor-pointer transition-all text-left group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-xs sm:text-sm text-slate-800 dark:text-zinc-100 group-hover:text-theme transition-colors line-clamp-1">
                      {n.title || '无标题便签'}
                    </span>
                    {project && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 flex items-center gap-1"
                        style={{
                          backgroundColor: `${project.color || '#10b981'}15`,
                          color: project.color || '#10b981',
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: project.color || '#10b981' }}
                        />
                        {project.name}
                      </span>
                    )}
                  </div>
                  {snippet && (
                    <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {snippet}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
