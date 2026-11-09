import React from 'react';
import { Pin, GitCommit, Share2, Trash2, Edit2, Image as ImageIcon, Link2, Copy } from 'lucide-react';
import type { Note, Project } from '../types';
import { getPlainTextSnippet, extractReferences } from '../utils/markdown';

interface NoteCardProps {
  note: Note;
  project?: Project;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onOpenGitDiff: (e: React.MouseEvent) => void;
  onOpenExport: (e: React.MouseEvent) => void;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  project,
  onClick,
  onEdit,
  onDuplicate,
  onDelete,
  onTogglePin,
  onOpenGitDiff,
  onOpenExport,
}) => {
  const snippet = getPlainTextSnippet(note.content, 110);
  const references = extractReferences(note.content);

  const formattedDate = new Date(note.updatedAt).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      onClick={onClick}
      className={`touch-press animate-card-in group relative bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-5 border transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between ${
        note.pinned
          ? 'border-amber-300/80 dark:border-amber-500/40 bg-gradient-to-b from-amber-50/30 via-white to-white dark:from-amber-950/20 dark:via-zinc-900 dark:to-zinc-900 ring-1 ring-amber-400/25'
          : 'border-slate-200/80 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700'
      }`}
    >
      <div>
        {/* Project Tag & Pinned Badge Header Row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          {project ? (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800/80 text-[11px] font-medium text-slate-600 dark:text-zinc-300">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: project.color || 'var(--theme-primary)' }}
              />
              <span className="truncate max-w-[120px]">{project.name}</span>
            </div>
          ) : (
            <div />
          )}

          {note.pinned && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-200/80 dark:border-amber-800/50 shadow-2xs"
              title="已置顶便签"
            >
              <Pin className="w-3 h-3 fill-current" />
              <span>置顶</span>
            </span>
          )}
        </div>

        {/* Note Title - Strong typography hierarchy */}
        <h3 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-zinc-100 line-clamp-2 group-hover:text-theme transition-colors leading-snug tracking-tight mb-1.5">
          {note.title || '无标题便签'}
        </h3>

        {/* Note Content Snippet - De-emphasized secondary text */}
        {snippet && (
          <p className="text-xs sm:text-[13px] text-slate-500 dark:text-zinc-400 line-clamp-3 mb-3 leading-relaxed">
            {snippet}
          </p>
        )}

        {/* Thumbnail Preview Image with clean border and natural ratio */}
        {note.images && note.images.length > 0 && (
          <div className="mb-3 rounded-xl overflow-hidden max-h-36 border border-slate-200/60 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-800/80">
            <img
              src={note.images[0]}
              alt="便签缩略图"
              className="w-full h-32 object-cover group-hover:scale-102 transition-transform duration-300"
              loading="lazy"
            />
          </div>
        )}

        {/* Subtle Metadata Badges: References & Image count */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {references.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-theme/10 text-theme font-medium border border-theme/20">
              <Link2 className="w-3 h-3 stroke-[2.5]" />
              <span>引用 {references.length} 处</span>
            </span>
          )}
          {note.images && note.images.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border border-slate-200/50 dark:border-zinc-700/50">
              <ImageIcon className="w-3 h-3" />
              <span>{note.images.length} 张图片</span>
            </span>
          )}
        </div>
      </div>

      {/* Card Footer: Timestamp & Tactile Action Icons */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500">
        <span className="font-mono text-[11px]">{formattedDate}</span>

        {/* Quick Actions Bar with consistent 28x28px hit areas */}
        <div className="flex items-center gap-0.5">
          {/* Pin Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(e);
            }}
            className={`touch-press-subtle w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
              note.pinned
                ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-amber-500'
            }`}
            title={note.pinned ? '取消置顶' : '置顶'}
          >
            <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'fill-current' : ''}`} />
          </button>

          {/* Git Revision History */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenGitDiff(e);
            }}
            className="touch-press-subtle w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-theme transition-all"
            title="查看修改历史与 Git 差异"
          >
            <GitCommit className="w-3.5 h-3.5" />
          </button>

          {/* Export */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenExport(e);
            }}
            className="touch-press-subtle w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-theme transition-all"
            title="导出便签"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          {/* Duplicate Note */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(e);
            }}
            className="touch-press-subtle w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-theme transition-all"
            title="复制便签（含 Git 历史）"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          {/* Edit */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(e);
            }}
            className="touch-press-subtle w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-theme/10 hover:text-theme dark:hover:bg-zinc-800 transition-all"
            title="编辑便签"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          {/* Delete */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(e);
            }}
            className="touch-press-subtle w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-rose-500 transition-all"
            title="删除便签"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
