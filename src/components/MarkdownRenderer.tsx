import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';
import { preProcessWikiLinks } from '../utils/markdown';

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
      return marked.parse(processed) as string;
    } catch {
      return content;
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
