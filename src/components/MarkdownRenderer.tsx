import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';
import { preProcessWikiLinks, escapeHtml } from '../utils/markdown';
import { sanitizeHtml } from '../utils/sanitizeHtml';

interface MarkdownRendererProps {
  content: string;
  onNavigateToNote?: (noteId: string) => void;
  onImageClick?: (src: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onNavigateToNote,
  onImageClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const htmlContent = React.useMemo(() => {
    try {
      const processed = preProcessWikiLinks(content);
      const parsed = marked.parse(processed) as string;
      // marked 会原样保留正文中的原始 HTML（script / onerror / svg 等），
      // 因此注入前必须按白名单净化
      return sanitizeHtml(parsed);
    } catch {
      // 解析失败时按纯文本转义展示，绝不直接注入原文
      return sanitizeHtml(escapeHtml(content).replace(/\n/g, '<br>'));
    }
  }, [content]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Attach click listeners to all [[noteId|title]] badges
    const handleBadgeClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.note-ref-badge');
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        const noteId = target.getAttribute('data-note-id');
        if (noteId && onNavigateToNote) {
          onNavigateToNote(noteId);
        }
      }
    };

    // Attach click listeners to images for fullscreen preview
    const handleImageClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'IMG' && onImageClick) {
        const src = (target as HTMLImageElement).src;
        if (src) {
          onImageClick(src);
        }
      }
    };

    el.addEventListener('click', handleBadgeClick);
    el.addEventListener('click', handleImageClick);

    return () => {
      el.removeEventListener('click', handleBadgeClick);
      el.removeEventListener('click', handleImageClick);
    };
  }, [htmlContent, onNavigateToNote, onImageClick]);

  return (
    <div
      ref={containerRef}
      className="markdown-body text-slate-800 dark:text-zinc-200 text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};
