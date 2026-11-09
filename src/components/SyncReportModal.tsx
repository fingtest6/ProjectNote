import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  PlusCircle,
  ArrowUp,
  ArrowDown,
  FileText,
} from 'lucide-react';
import type { SyncResult, SyncMode } from '../types';

interface SyncReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: SyncResult | null;
}

const MODE_CONFIG: Record<
  SyncMode,
  { label: string; badgeColor: string; icon: React.ComponentType<{ className?: string }> }
> = {
  'smart-merge': {
    label: '双向智能合并',
    badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    icon: Sparkles,
  },
  'new-only': {
    label: '仅同步新增便签',
    badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
    icon: PlusCircle,
  },
  'push-overwrite': {
    label: '以本机为准完全覆盖对方',
    badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    icon: ArrowUp,
  },
  'pull-overwrite': {
    label: '以对方为准完全覆盖本机',
    badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
    icon: ArrowDown,
  },
};

export const SyncReportModal: React.FC<SyncReportModalProps> = ({ isOpen, onClose, result }) => {
  const [showDetails, setShowDetails] = useState(true);

  if (!isOpen || !result) return null;

  const mode = result.mode || 'smart-merge';
  const modeInfo = MODE_CONFIG[mode] || MODE_CONFIG['smart-merge'];
  const ModeIcon = modeInfo.icon;

  // 覆盖类模式的方向描述取决于本机是发起方还是接收方
  const perspective = result.perspective || 'initiator';
  const modeLabel =
    perspective === 'receiver'
      ? mode === 'push-overwrite'
        ? '对方全量覆盖了本机'
        : mode === 'pull-overwrite'
          ? '本机全量覆盖了对方'
          : modeInfo.label
      : modeInfo.label;

  const renderDetailItem = (detail: string, index: number) => {
    let tagColor = 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300';
    let tagText = '记录';
    let content = detail;

    if (detail.startsWith('[删除同步]')) {
      tagColor = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
      tagText = '删除同步';
      content = detail.replace('[删除同步]', '').trim();
    } else if (detail.startsWith('[新增拉取]')) {
      tagColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
      tagText = '新增拉取';
      content = detail.replace('[新增拉取]', '').trim();
    } else if (detail.startsWith('[拉取更新]')) {
      tagColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20';
      tagText = '拉取更新';
      content = detail.replace('[拉取更新]', '').trim();
    } else if (detail.startsWith('[推送更新]')) {
      tagColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
      tagText = '推送更新';
      content = detail.replace('[推送更新]', '').trim();
    } else if (detail.startsWith('[推送新增]')) {
      tagColor = 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20';
      tagText = '推送新增';
      content = detail.replace('[推送新增]', '').trim();
    } else if (detail.startsWith('[拉取分类]') || detail.startsWith('[拉取项目]')) {
      tagColor = 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20';
      tagText = '分类同步';
      content = detail.replace(/^\[(拉取分类|拉取项目)\]/, '').trim();
    } else if (detail.startsWith('[推送分类]') || detail.startsWith('[推送项目]')) {
      tagColor = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20';
      tagText = '分类推送';
      content = detail.replace(/^\[(推送分类|推送项目)\]/, '').trim();
    }

    return (
      <div
        key={index}
        className="flex items-start gap-2 py-1.5 px-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800 text-xs"
      >
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${tagColor}`}>
          {tagText}
        </span>
        <span className="text-slate-700 dark:text-zinc-200 flex-1 break-all leading-relaxed">
          {content}
        </span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-fade-scale">
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 flex flex-col max-h-[85vh] animate-slide-up-spring"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-850/50">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center ${
                result.success
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="w-5 h-5 stroke-[2.3]" />
              ) : (
                <AlertCircle className="w-5 h-5 stroke-[2.3]" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-800 dark:text-zinc-100">
                {result.success ? '互联同步完成报告' : '同步未能完成'}
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                局域网直连 · 数据双向校验结果
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="touch-press w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Status Banner */}
          <div
            className={`p-3.5 rounded-2xl text-xs flex items-center justify-between border ${
              result.success
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
            }`}
          >
            <span className="font-medium flex-1 pr-2 leading-relaxed">{result.message}</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 shrink-0 ${modeInfo.badgeColor}`}>
              <ModeIcon className="w-3 h-3" />
              <span>{modeLabel}</span>
            </span>
          </div>

          {/* Metric Dashboard */}
          {result.success && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 text-center space-y-0.5">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">拉取更新</div>
                <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {result.pulledNotes}
                  <span className="text-xs font-normal text-slate-400 ml-1">篇</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 text-center space-y-0.5">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">推送更新</div>
                <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  {result.pushedNotes}
                  <span className="text-xs font-normal text-slate-400 ml-1">篇</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 text-center space-y-0.5">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">新增便签</div>
                <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {result.newNotesAdded ?? 0}
                  <span className="text-xs font-normal text-slate-400 ml-1">篇</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/70 dark:border-zinc-800 text-center space-y-0.5">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">历史版本</div>
                <div className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
                  {result.historiesSynced ?? 0}
                  <span className="text-xs font-normal text-slate-400 ml-1">条</span>
                </div>
              </div>
            </div>
          )}

          {/* Change Details Accordion */}
          {result.details && result.details.length > 0 ? (
            <div className="space-y-2 pt-1">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="touch-press w-full flex items-center justify-between text-xs text-slate-600 dark:text-zinc-300 font-medium py-1"
              >
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-theme" />
                  详细变动清单 ({result.details.length} 项记录)
                </span>
                {showDetails ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {showDetails && (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {result.details.map(renderDetailItem)}
                </div>
              )}
            </div>
          ) : (
            result.success && (
              <div className="p-3 text-center text-xs text-slate-400">
                双方便签与分类已是最新状态，无新增或冲突变动。
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-100 dark:border-zinc-800 flex justify-end bg-slate-50/50 dark:bg-zinc-850/50">
          <button
            onClick={onClose}
            className="touch-press px-5 py-2 rounded-xl bg-theme hover:brightness-95 text-white font-medium text-xs shadow-xs transition-all"
          >
            完成并关闭
          </button>
        </div>
      </div>
    </div>
  );
};
