import React, { useState, useMemo } from 'react';
import {
  X,
  Edit2,
  GitCommit,
  Share2,
  Trash2,
  Pin,
  Link2,
  Calendar,
  Image as ImageIcon,
  Copy,
} from 'lucide-react';
import type { Note, Project, NoteHistory } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { extractReferences } from '../utils/markdown';

interface NoteDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note | null;
  project?: Project;
  allNotes: Note[];
  projects: Project[];
  histories: NoteHistory[];
  onEdit: (note: Note) => void;
  onDuplicate: (note: Note) => void;
  onDelete: (id: string) => void;
  onTogglePin: (note: Note) => void;
  onOpenGitDiff: (note: Note) => void;
  onOpenExport: (note: Note) => void;
  onNavigateToNote: (noteId: string) => void;
}

export const NoteDetailModal: React.FC<NoteDetailModalProps> = ({
  isOpen,
  onClose,
  note,
  project,
  allNotes,
  projects,
  histories,
  onEdit,
  onDuplicate,
  onDelete,
  onTogglePin,
  onOpenGitDiff,
  onOpenExport,
  onNavigateToNote,
}) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Find all backlinks (notes that cite this note)
  const backlinks = useMemo(() => {
    if (!note) return [];
    return allNotes.filter((otherNote) => {
      if (otherNote.id === note.id) return false;
      const refs = extractReferences(otherNote.content);
      return refs.some((r) => r.targetId === note.id);
    });
  }, [allNotes, note]);

  const projectMap = useMemo(() => {
    return new Map(projects.map((p) => [p.id, p]));
  }, [projects]);

  if (!isOpen || !note) return null;

  const dateStr = new Date(note.updatedAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-scale">
      <div
        className="w-full h-[95vh] sm:h-auto sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/80 dark:border-zinc-800 max-h-[92vh] animate-slide-up-spring"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Action Bar - Refactored for clean visual hierarchy */}
        <div
          className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-slate-200/70 dark:border-zinc-800/80 flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-zinc-800/50"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          }}
        >
          {/* Left: Project Badge & Date */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden mr-1">
            {project && (
              <span
                className="text-xs px-2 py-1 rounded-lg font-medium inline-flex items-center gap-1.5 min-w-0 max-w-[120px] sm:max-w-[220px] border border-slate-200/50 dark:border-zinc-700/50 overflow-hidden shrink-0"
                style={{
                  backgroundColor: `${project.color || 'var(--theme-primary)'}18`,
                  color: project.color || 'var(--theme-primary)',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full ring-1 ring-black/10 shrink-0"
                  style={{ backgroundColor: project.color || 'var(--theme-primary)' }}
                />
                <span className="truncate min-w-0">{project.name}</span>
              </span>
            )}
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 hidden md:inline-flex items-center gap-1 font-mono shrink-0">
              <Calendar className="w-3 h-3" />
              {dateStr}
            </span>
          </div>

          {/* Action Icons Toolbar with clear hierarchy and no-wrap guarantees */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Pin Toggle */}
            <button
              onClick={() => onTogglePin(note)}
              className={`touch-press w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                note.pinned
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
              title={note.pinned ? '取消置顶' : '置顶'}
            >
              <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'fill-current' : ''}`} />
            </button>

            {/* Git Revision History */}
            <button
              onClick={() => onOpenGitDiff(note)}
              className="touch-press h-7 sm:h-8 px-1.5 sm:px-2 rounded-lg text-slate-500 hover:text-theme hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all flex items-center gap-1 shrink-0"
              title="查看修改历史与 Git 差异"
            >
              <GitCommit className="w-3.5 h-3.5 text-theme" />
              <span className="text-[11px] font-semibold text-theme hidden sm:inline whitespace-nowrap">
                {histories.length} 提交
              </span>
            </button>

            {/* Export */}
            <button
              onClick={() => onOpenExport(note)}
              className="touch-press w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
              title="导出便签"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>

            {/* Duplicate Note */}
            <button
              onClick={() => onDuplicate(note)}
              className="touch-press w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 text-slate-400 hover:text-theme hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
              title="复制便签（含 Git 历史）"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            {/* Edit (Primary Accent Button) - whitespace-nowrap & min-w prevents vertical splitting */}
            <button
              onClick={() => onEdit(note)}
              className="touch-press h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg bg-theme/10 hover:bg-theme/20 text-theme font-medium text-xs flex flex-row items-center gap-1 border border-theme/20 shrink-0 whitespace-nowrap transition-all"
              title="编辑此便签"
            >
              <Edit2 className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
              <span className="whitespace-nowrap select-none">编辑</span>
            </button>

            {/* Delete */}
            <button
              onClick={() => {
                if (confirm('确定要删除这条便签吗？')) {
                  onDelete(note.id);
                  onClose();
                }
              }}
              className="touch-press w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
              title="删除便签"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-700 mx-0.5 shrink-0" />

            {/* Close */}
            <button
              onClick={onClose}
              className="touch-press w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body - Refactored typography & relaxed reading rhythm */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 select-text">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-100 mb-4 pb-3 border-b border-slate-100 dark:border-zinc-800/80">
            {note.title}
          </h1>

          <div className="py-1">
            <MarkdownRenderer
              content={note.content}
              onNavigateToNote={onNavigateToNote}
              onImageClick={(src) => setPreviewImage(src)}
            />
          </div>

          {/* Attached Images Gallery with clean rounded cards */}
          {note.images && note.images.length > 0 && (
            <div className="mt-7 pt-5 border-t border-slate-100 dark:border-zinc-800/80">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
                <ImageIcon className="w-3.5 h-3.5 text-theme" />
                <span>图片附件 ({note.images.length} 张)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {note.images.map((imgSrc, idx) => (
                  <div
                    key={idx}
                    onClick={() => setPreviewImage(imgSrc)}
                    className="group relative rounded-xl overflow-hidden border border-slate-200/80 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-800/60 aspect-video cursor-pointer hover:shadow-md transition-all shadow-2xs"
                  >
                    <img
                      src={imgSrc}
                      alt={`附件图片 ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Backlinks Section (反向链接：被哪些便签引用了) */}
          {backlinks.length > 0 && (
            <div className="mt-8 pt-5 border-t border-slate-200/70 dark:border-zinc-800/80">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
                <Link2 className="w-3.5 h-3.5 text-theme" />
                <span>反向链接 · 被以下 {backlinks.length} 条便签引用</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {backlinks.map((b) => {
                  const bProject = projectMap.get(b.projectId);
                  return (
                    <div
                      key={b.id}
                      onClick={() => onNavigateToNote(b.id)}
                      className="p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 hover:border-theme/40 hover:bg-theme/5 cursor-pointer transition-all text-left group shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-medium text-xs text-slate-800 dark:text-zinc-200 group-hover:text-theme truncate">
                          {b.title}
                        </span>
                        {bProject && (
                          <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                            {bProject.name}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1 leading-normal">
                        {b.content.replace(/[#*`[\]]/g, '')}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Fullscreen Image Preview Lightbox */}
        {previewImage && (
          <div
            className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-scale"
            onClick={() => setPreviewImage(null)}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImage}
              alt="全屏图片预览"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  );
};
