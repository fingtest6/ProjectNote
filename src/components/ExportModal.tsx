import React, { useState } from 'react';
import {
  X,
  Download,
  Image as ImageIcon,
  Copy,
  Check,
  FileDown,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import type { Note, Project } from '../types';
import { generateNoteCanvasCard } from '../utils/canvasCard';
import { exportTextFile, exportImageFile, copyTextFallback } from '../utils/exporter';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note;
  project?: Project;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  note,
  project,
}) => {
  const [copied, setCopied] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImgUrl, setGeneratedImgUrl] = useState<string | null>(null);
  const [savedImagePath, setSavedImagePath] = useState<string | null>(null);
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const formattedDate = new Date(note.updatedAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Export as Markdown file via Android system file save dialog (ACTION_CREATE_DOCUMENT)
  const handleExportMd = async () => {
    const filename = `${note.title || '便签'}.md`;
    showStatus('正在调起文件保存接口...');
    const result = await exportTextFile(filename, note.content);
    if (result.method === 'cancelled') {
      showStatus('已取消文件保存');
      return;
    }
    if (result.success) {
      if (result.method === 'android-saf') {
        showStatus('✅ Markdown 文件已成功保存到您选择的目录！');
      } else if (result.method === 'native-documents') {
        showStatus(`✅ 已保存至手机本地目录：${result.path}`);
      } else {
        showStatus('✅ Markdown 文件已保存！');
      }
    } else {
      setShowRawMarkdown(true);
      showStatus('保存遇到限制，已为您展开全文供复制');
    }
  };

  // Generate & directly save Card Image into local Pictures folder (no Share sheet)
  const handleExportImage = async () => {
    try {
      setGeneratingImage(true);
      showStatus('正在生成并保存卡片图片到本地相册文件夹...');

      const dataUrl = await generateNoteCanvasCard({
        title: note.title,
        content: note.content,
        projectName: project?.name,
        projectColor: project?.color,
        dateStr: formattedDate,
        images: note.images,
      });

      setGeneratedImgUrl(dataUrl);

      const filename = `${note.title || '便签卡片'}.png`;
      const result = await exportImageFile(filename, dataUrl);

      if (result.success) {
        setSavedImagePath(result.path || 'Pictures/ProjectNotes');
        if (result.method === 'pictures-saved' || result.method === 'documents-pictures-saved') {
          showStatus(`✅ 已直接存入手机图片文件夹：${result.path}`);
        } else {
          showStatus('✅ 卡片图片已直接保存下载！');
        }
      } else {
        showStatus('已生成卡片图片，长按下方图片也可直接保存到手机');
      }
    } catch (err) {
      console.error('Failed to generate image:', err);
      showStatus('生成图片失败，请重试');
    } finally {
      setGeneratingImage(false);
    }
  };

  // Copy Markdown
  const handleCopy = async () => {
    const success = await copyTextFallback(note.content);
    if (success) {
      setCopied(true);
      showStatus('✅ 便签 Markdown 内容已复制到剪贴板！');
      setTimeout(() => setCopied(false), 2000);
    } else {
      setShowRawMarkdown(true);
      showStatus('已展开文本框，请长按选中复制');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-scale">
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-200/80 dark:border-zinc-800 flex flex-col max-h-[92vh] animate-slide-up-spring"
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
            <Download className="w-4 h-4 text-theme" />
            <h3 className="font-semibold text-base text-slate-800 dark:text-zinc-100">
              便签导出与本地保存
            </h3>
          </div>
          <button
            onClick={onClose}
            className="touch-press w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Toast Banner */}
        {statusMessage && (
          <div className="px-4 py-2.5 bg-theme/15 text-theme text-xs font-medium flex items-center gap-2 animate-fadeIn border-b border-theme/20">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="flex-1 break-all">{statusMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-3 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-2 overflow-x-auto bg-slate-50/70 dark:bg-zinc-850/40 no-scrollbar">
          {/* Export MD */}
          <button
            onClick={handleExportMd}
            className="touch-press flex-1 min-w-[110px] h-8 flex items-center justify-center gap-1.5 px-3 rounded-xl bg-theme text-white text-xs font-medium hover:brightness-95 shadow-xs active:scale-98 transition-all shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" />
            保存 .md 文件
          </button>

          {/* Direct Save Image to Pictures */}
          <button
            onClick={handleExportImage}
            disabled={generatingImage}
            className="touch-press flex-1 min-w-[115px] h-8 flex items-center justify-center gap-1.5 px-3 rounded-xl bg-slate-200/80 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-medium hover:bg-slate-200 dark:hover:bg-zinc-750 active:scale-98 transition-all shrink-0"
          >
            <ImageIcon className="w-3.5 h-3.5 text-theme" />
            {generatingImage ? '保存中...' : '保存卡片图片'}
          </button>

          {/* Copy Text */}
          <button
            onClick={handleCopy}
            className="touch-press h-8 px-3 rounded-xl border border-slate-200/80 dark:border-zinc-700/80 text-slate-700 dark:text-zinc-300 text-xs font-medium hover:bg-white dark:hover:bg-zinc-800 flex items-center gap-1.5 shrink-0 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? '已复制' : '复制文本'}
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 dark:bg-zinc-950/60 flex flex-col items-center">
          {/* 1. Generated Card Image Preview */}
          {generatedImgUrl ? (
            <div className="w-full max-w-md flex flex-col items-center animate-fadeIn">
              {savedImagePath && (
                <div className="w-full mb-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300 break-all">
                    图片已直接保存至本地图片目录：{savedImagePath}
                  </span>
                </div>
              )}

              <img
                src={generatedImgUrl}
                alt="生成的便签卡片图"
                className="w-full h-auto rounded-xl shadow-lg border border-slate-200/80 dark:border-zinc-800 select-auto"
              />

              <button
                onClick={() => setGeneratedImgUrl(null)}
                className="touch-press mt-3 text-xs text-slate-500 dark:text-zinc-400 hover:text-theme underline font-medium"
              >
                返回文本预览
              </button>
            </div>
          ) : (
            /* 2. Text Content & Full Markdown Direct Viewer */
            <div className="w-full max-w-md space-y-3">
              {/* Note Content Preview Card */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 dark:border-zinc-800">
                {project && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: project.color || 'var(--theme-primary)' }}
                    />
                    <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                      {project.name}
                    </span>
                  </div>
                )}
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100 mb-1.5">
                  {note.title}
                </h2>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono mb-2.5">
                  更新时间：{formattedDate}
                </p>
                <div className="text-xs text-slate-600 dark:text-zinc-300 line-clamp-6 whitespace-pre-wrap leading-relaxed border-t border-slate-100 dark:border-zinc-800/80 pt-2.5">
                  {note.content}
                </div>

                {/* Attached Images Preview inside Export Modal */}
                {note.images && note.images.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800/80 grid grid-cols-2 gap-2">
                    {note.images.map((imgSrc, i) => (
                      <img
                        key={i}
                        src={imgSrc}
                        alt={`便签图片 ${i + 1}`}
                        className="w-full h-auto rounded-lg border border-slate-200/80 dark:border-zinc-700 object-contain max-h-36 bg-slate-50 dark:bg-zinc-800"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Expandable Raw Text Box for direct copy */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl p-3.5 border border-slate-200/80 dark:border-zinc-800">
                <button
                  onClick={() => setShowRawMarkdown(!showRawMarkdown)}
                  className="touch-press w-full flex items-center justify-between text-xs font-medium text-slate-700 dark:text-zinc-300"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-theme" />
                    查看 / 复制原始 Markdown 全文
                  </span>
                  <span className="text-theme text-[11px]">
                    {showRawMarkdown ? '收起' : '展开文本框'}
                  </span>
                </button>

                {showRawMarkdown && (
                  <div className="mt-2.5 animate-fadeIn">
                    <textarea
                      readOnly
                      value={note.content}
                      rows={6}
                      className="w-full text-xs font-mono p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 focus:outline-none select-all"
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      提示：点击文本框会自动全选，长按即可复制。
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
