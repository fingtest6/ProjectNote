import { marked } from 'marked';
import type { NoteReference } from '../types';

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Extracts all [[noteId|title]] references from markdown text
 */
export function extractReferences(content: string): NoteReference[] {
  const regex = /\[\[([a-zA-Z0-9_-]+)\|([^\]]+)\]\]/g;
  const references: NoteReference[] = [];
  const seen = new Set<string>();

  let match;
  while ((match = regex.exec(content)) !== null) {
    const targetId = match[1];
    const targetTitle = match[2];
    if (!seen.has(targetId)) {
      seen.add(targetId);
      references.push({
        targetId,
        targetTitle,
      });
    }
  }

  return references;
}

export const NOTE_REF_BADGE_CLASS =
  'note-ref-badge inline-flex items-center gap-1 px-2 py-0.5 my-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors shadow-sm select-none';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Transforms [[noteId|title]] syntax into custom HTML span buttons
 * that can be intercepted by click handlers
 */
export function preProcessWikiLinks(markdown: string): string {
  // Replace [[noteId|title]] with <span class="note-ref-badge" data-note-id="noteId">🔗 title</span>
  // 便签标题来自用户输入，必须转义后再拼进 HTML，防止标题注入标签
  return markdown.replace(
    /\[\[([a-zA-Z0-9_-]+)\|([^\]]+)\]\]/g,
    (_match, noteId: string, title: string) =>
      `<span class="${NOTE_REF_BADGE_CLASS}" data-note-id="${noteId}">🔗 ${escapeHtml(title)}</span>`
  );
}

/**
 * Extracts plain text snippet (e.g. for card preview)
 */
export function getPlainTextSnippet(markdown: string, maxLength: number = 120): string {
  if (!markdown) return '';
  // Remove markdown headers, links, images, codeblocks, etc.
  let text = markdown
    .replace(/!\[.*?\]\(.*?\)/g, '[图片]')
    .replace(/\[\[.*?\|(.*?)\]\]/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '[代码块]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~`>#-]/g, '')
    .trim();

  // Collapse multiple whitespaces/newlines
  text = text.replace(/\s+/g, ' ');

  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  return text;
}
