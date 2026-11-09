import React, { useState, useMemo } from 'react';
import { X, GitCommit, RotateCcw, Clock, ArrowRight, FileText } from 'lucide-react';
import type { Note, NoteHistory } from '../types';
import { computeLineDiff } from '../utils/diff';

interface GitDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note;
  histories: NoteHistory[];
  onRestoreVersion: (history: NoteHistory) => Promise<void>;
}

export const GitDiffModal: React.FC<GitDiffModalProps> = ({
  isOpen,
  onClose,
  note,
  histories,
  onRestoreVersion,
}) => {
  // Sort histories descending (newest first)
  const sortedHistories = useMemo(() => {
    return [...histories].sort((a, b) => b.version - a.version);
  }, [histories]);

  // Selected history version for comparison
  const [selectedVersionId, setSelectedVersionId] = useState<string>(() => {
    return sortedHistories[0]?.id || '';
  });

  // Diff comparison target mode: 'compare-with-previous' | 'compare-with-current'
  const [compareMode, setCompareMode] = useState<'previous' | 'current'>('previous');

  const selectedHistory = useMemo(() => {
    return sortedHistories.find((h) => h.id === selectedVersionId) || sortedHistories[0];
  }, [sortedHistories, selectedVersionId]);

  // Compute the old and new text for diffing
  const { oldText, newText, compareLabel } = useMemo(() => {
    if (!selectedHistory) {
      return { oldText: '', newText: note.content, compareLabel: '' };
    }

    if (compareMode === 'current') {
      return {
        oldText: selectedHistory.content,
        newText: note.content,
        compareLabel: `对比：版本 v${selectedHistory.version} ➔ 当前最新版本`,
      };
    } else {
      // Find the immediately preceding history version
      const prev = sortedHistories.find((h) => h.version === selectedHistory.version - 1);
      return {
        oldText: prev ? prev.content : '',
        newText: selectedHistory.content,
        compareLabel: prev
          ? `对比：版本 v${prev.version} ➔ 版本 v${selectedHistory.version}`
          : `版本 v${selectedHistory.version}（初始创建）`,
      };
    }
  }, [selectedHistory, compareMode, note.content, sortedHistories]);

  const diffResult = useMemo(() => {
    return computeLineDiff(oldText, newText);
  }, [oldText, newText]);

  if (!isOpen) return null;

  const handleRestore = async (h: NoteHistory) => {
    if (
      confirm(
        `确定要直接回滚到「版本 v${h.version} (${h.commitMessage})」吗？\n回滚后将直接恢复至该版本状态，不会新增额外提交记录。`
      )
    ) {
      await onRestoreVersion(h);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-scale">
      <div
        className="w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-200/80 dark:border-zinc-800 flex flex-col h-[94vh] sm:h-[90vh] max-h-[820px] animate-slide-up-spring"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Safe Area */}
        <div
          className="px-5 py-3 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-800/50"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-theme/15 text-theme flex items-center justify-center">
              <GitCommit className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base text-slate-900 dark:text-zinc-100">
                  修改历史与 Git 差异查看
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 font-medium text-slate-600 dark:text-zinc-400">
                  {histories.length} 次提交
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-zinc-500 truncate max-w-md">
                便签：{note.title}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="touch-press w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-200/80 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Main Layout (Left: Commit Log, Right: Diff Viewer) */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Commit History List */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-200 dark:border-zinc-800 flex flex-col bg-slate-50/60 dark:bg-zinc-950/40">
            <div className="p-3 border-b border-slate-200/60 dark:border-zinc-800/60 text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              版本提交历史
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {sortedHistories.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">暂无版本快照</div>
              ) : (
                sortedHistories.map((h) => {
                  const isSelected = h.id === selectedHistory?.id;
                  const dateStr = new Date(h.timestamp).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={h.id}
                      onClick={() => setSelectedVersionId(h.id)}
                      className={`p-3 rounded-xl cursor-pointer transition-all border text-left ${
                        isSelected
                          ? 'border-theme bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-theme/20'
                          : 'border-transparent hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            isSelected
                              ? 'bg-theme text-white'
                              : 'bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                          }`}
                        >
                          v{h.version}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                          {dateStr}
                        </span>
                      </div>

                      <div className="font-medium text-xs text-slate-800 dark:text-zinc-200 line-clamp-1 mb-1">
                        {h.commitMessage || '更新便签'}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500">
                        <span>{h.charCount || h.content.length} 字符</span>
                        {isSelected && (
                          <span className="text-theme font-medium flex items-center gap-0.5">
                            查看对比 <ArrowRight className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Diff Viewer Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-900">
            {/* Diff Toolbar */}
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/40 dark:bg-zinc-800/20">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  {compareLabel}
                </span>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-medium">
                    +{diffResult.additions}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 font-medium">
                    -{diffResult.deletions}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Switch compare mode */}
                <div className="inline-flex rounded-lg p-0.5 bg-slate-200 dark:bg-zinc-800 text-[11px] font-medium">
                  <button
                    onClick={() => setCompareMode('previous')}
                    className={`px-2 py-1 rounded-md transition-all ${
                      compareMode === 'previous'
                        ? 'bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 shadow-xs'
                        : 'text-slate-500 dark:text-zinc-400'
                    }`}
                  >
                    对比上一版
                  </button>
                  <button
                    onClick={() => setCompareMode('current')}
                    className={`px-2 py-1 rounded-md transition-all ${
                      compareMode === 'current'
                        ? 'bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 shadow-xs'
                        : 'text-slate-500 dark:text-zinc-400'
                    }`}
                  >
                    对比最新版
                  </button>
                </div>

                {/* Restore button */}
                {selectedHistory && (
                  <button
                    onClick={() => handleRestore(selectedHistory)}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-theme hover:brightness-95 text-white text-xs font-medium transition-all shadow-xs"
                    title="将便签恢复到选中的这个版本"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    回退到此版本
                  </button>
                )}
              </div>
            </div>

            {/* Git Diff Code Viewer */}
            <div className="flex-1 overflow-auto font-mono text-xs p-2 sm:p-4 select-text bg-slate-50/50 dark:bg-zinc-950/70">
              {diffResult.lines.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <FileText className="w-8 h-8 mb-2 opacity-50" />
                  <span>内容无变更</span>
                </div>
              ) : (
                <div className="space-y-0.5 rounded-lg border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
                  {diffResult.lines.map((line, idx) => {
                    const isAdded = line.type === 'added';
                    const isRemoved = line.type === 'removed';

                    return (
                      <div
                        key={idx}
                        className={`flex items-start px-2 py-0.5 font-mono leading-5 transition-colors ${
                          isAdded
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                            : isRemoved
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                            : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/40'
                        }`}
                      >
                        {/* Old line number */}
                        <span className="w-8 shrink-0 text-right pr-2 text-[10px] select-none text-slate-400 dark:text-zinc-600">
                          {line.oldLineNumber ?? ''}
                        </span>
                        {/* New line number */}
                        <span className="w-8 shrink-0 text-right pr-2 text-[10px] select-none text-slate-400 dark:text-zinc-600">
                          {line.newLineNumber ?? ''}
                        </span>
                        {/* +/- sign */}
                        <span
                          className={`w-5 shrink-0 text-center font-bold select-none ${
                            isAdded
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isRemoved
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-transparent'
                          }`}
                        >
                          {isAdded ? '+' : isRemoved ? '-' : ' '}
                        </span>
                        {/* Line content */}
                        <span className="flex-1 whitespace-pre-wrap break-all">
                          {line.content || ' '}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
