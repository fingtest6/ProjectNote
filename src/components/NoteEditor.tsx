import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Check,
  Eye,
  Edit3,
  List,
  CheckSquare,
  Quote,
  Image as ImageIcon,
  Link2,
  GitCommit,
  Pin,
  ChevronDown,
  Trash2,
  Plus,
  FileUp,
} from 'lucide-react';
import type { Note, Project } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ReferencePickerModal } from './ReferencePickerModal';
import { importMarkdownFile, parseImportedMarkdown } from '../utils/exporter';

interface NoteEditorProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note | null;
  activeProjectId: string;
  projects: Project[];
  allNotes: Note[];
  onSave: (
    noteData: Partial<Note>,
    commitMessage: string
  ) => Promise<void>;
}

// Synchronous helper to extract clean markdown text and images on initialization
function extractCleanNoteData(note: Note | null, defaultProjectId: string) {
  if (!note) {
    return {
      title: '',
      content: '',
      projectId: defaultProjectId,
      pinned: false,
      images: [] as string[],
    };
  }

  let text = note.content || '';
  const extractedImages: string[] = [...(note.images || [])];

  // Extract existing base64 images from content if any
  const base64Regex = /!\[(.*?)\]\((data:image\/[a-zA-Z]+;base64,[^)]+)\)/g;
  let match;
  while ((match = base64Regex.exec(text)) !== null) {
    if (!extractedImages.includes(match[2])) {
      extractedImages.push(match[2]);
    }
  }
  text = text.replace(base64Regex, '').trim();

  return {
    title: note.title || '',
    content: text,
    projectId: note.projectId || defaultProjectId,
    pinned: note.pinned || false,
    images: extractedImages,
  };
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  isOpen,
  onClose,
  note,
  activeProjectId,
  projects,
  allNotes,
  onSave,
}) => {
  // Synchronous initialization on component mount - ensures content is NEVER blank
  const [initialData] = useState(() => extractCleanNoteData(note, activeProjectId));

  const [title, setTitle] = useState(initialData.title);
  const [content, setContent] = useState(initialData.content);
  const [projectId, setProjectId] = useState(initialData.projectId);
  const [pinned, setPinned] = useState(initialData.pinned);
  const [images, setImages] = useState<string[]>(initialData.images);
  const [commitMessage, setCommitMessage] = useState('');
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [isRefPickerOpen, setIsRefPickerOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize state if note prop changes while editor remains mounted
  useEffect(() => {
    if (note) {
      const data = extractCleanNoteData(note, activeProjectId);
      setTitle(data.title);
      setContent(data.content);
      setProjectId(data.projectId);
      setPinned(data.pinned);
      setImages(data.images);
    } else {
      setTitle('');
      setContent('');
      setProjectId(activeProjectId);
      setPinned(false);
      setImages([]);
    }
  }, [note?.id, note?.updatedAt, activeProjectId]);

  if (!isOpen) return null;

  // 1. Intelligent Line-level format toggle (H1, H2, Todo checkbox, Bullet list, Quote)
  // Supports multi-line selection and smart prefix replacement (e.g. # -> ##, - -> - [ ])
  const toggleLinePrefix = (targetPrefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = content;

    // Find full line bounds for the entire selection
    const firstLineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lastLineEnd = text.indexOf('\n', end);
    const actualEnd = lastLineEnd === -1 ? text.length : lastLineEnd;

    const selectedBlock = text.substring(firstLineStart, actualEnd);
    const lines = selectedBlock.split('\n');

    // Helper regex patterns for conflicting prefixes
    const headingRegex = /^#{1,6}\s+/;
    const taskRegex = /^-\s+\[([ xX])\]\s+/;
    const listRegex = /^[-*+]\s+/;
    const quoteRegex = /^>\s+/;

    const isTargetHeading = targetPrefix.startsWith('#');
    const isTargetTask = targetPrefix.startsWith('- [ ]');
    const isTargetList = targetPrefix === '- ';
    const isTargetQuote = targetPrefix === '> ';

    const updatedLines = lines.map((line) => {
      if (isTargetHeading) {
        if (line.startsWith(targetPrefix)) {
          // Toggle off heading
          return line.replace(headingRegex, '');
        } else {
          // Replace any existing heading, or prepend heading
          const stripped = line.replace(headingRegex, '');
          return targetPrefix + stripped;
        }
      } else if (isTargetTask) {
        if (taskRegex.test(line)) {
          // Toggle off task checkbox
          return line.replace(taskRegex, '');
        } else if (listRegex.test(line)) {
          // Convert bullet list to task checkbox
          return line.replace(listRegex, targetPrefix);
        } else {
          return targetPrefix + line;
        }
      } else if (isTargetList) {
        if (taskRegex.test(line)) {
          // Convert task checkbox to simple bullet
          return line.replace(taskRegex, targetPrefix);
        } else if (listRegex.test(line)) {
          // Toggle off bullet list
          return line.replace(listRegex, '');
        } else {
          return targetPrefix + line;
        }
      } else if (isTargetQuote) {
        if (quoteRegex.test(line)) {
          // Toggle off quote
          return line.replace(quoteRegex, '');
        } else {
          return targetPrefix + line;
        }
      } else {
        if (line.startsWith(targetPrefix)) {
          return line.substring(targetPrefix.length);
        } else {
          return targetPrefix + line;
        }
      }
    });

    const replacedBlock = updatedLines.join('\n');
    const newContent = text.substring(0, firstLineStart) + replacedBlock + text.substring(actualEnd);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      const lengthDiff = replacedBlock.length - selectedBlock.length;
      if (start === end) {
        const newCursor = Math.max(firstLineStart, Math.min(newContent.length, start + lengthDiff));
        textarea.setSelectionRange(newCursor, newCursor);
      } else {
        textarea.setSelectionRange(firstLineStart, firstLineStart + replacedBlock.length);
      }
    }, 10);
  };

  // 2. Inline format wrapper with smart unwrapping (Bold, Italic, Strikethrough, Code)
  const wrapSelection = (tag: string, placeholder: string = '文字') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);

    if (selected.length > 0) {
      // Check if selected text is already wrapped in tag
      if (
        selected.startsWith(tag) &&
        selected.endsWith(tag) &&
        selected.length >= tag.length * 2
      ) {
        const unwrapped = selected.substring(tag.length, selected.length - tag.length);
        const newContent = content.substring(0, start) + unwrapped + content.substring(end);
        setContent(newContent);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start, start + unwrapped.length);
        }, 10);
        return;
      }

      // Check if surrounding characters outside selection are tag
      const before = content.substring(Math.max(0, start - tag.length), start);
      const after = content.substring(end, end + tag.length);
      if (before === tag && after === tag) {
        const newContent = content.substring(0, start - tag.length) + selected + content.substring(end + tag.length);
        setContent(newContent);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start - tag.length, end - tag.length);
        }, 10);
        return;
      }

      // Wrap text
      const newContent = content.substring(0, start) + tag + selected + tag + content.substring(end);
      setContent(newContent);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, end + tag.length);
      }, 10);
    } else {
      // Check if cursor is between empty tags e.g. **|**
      const before = content.substring(Math.max(0, start - tag.length), start);
      const after = content.substring(start, start + tag.length);
      if (before === tag && after === tag) {
        const newContent = content.substring(0, start - tag.length) + content.substring(start + tag.length);
        setContent(newContent);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start - tag.length, start - tag.length);
        }, 10);
        return;
      }

      // Insert tag with placeholder
      const newContent = content.substring(0, start) + tag + placeholder + tag + content.substring(end);
      setContent(newContent);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, start + tag.length + placeholder.length);
      }, 10);
    }
  };

  // 3. Smart Enter & Tab Keyboard Navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (e.key === 'Enter') {
      const start = textarea.selectionStart;
      const text = content;
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const currentLine = text.substring(lineStart, start);

      // Check for empty todo item "- [ ] " or "- [x] " -> pressing Enter exits list
      if (/^-\s+\[([ xX])\]\s*$/.test(currentLine)) {
        e.preventDefault();
        const newContent = text.substring(0, lineStart) + text.substring(start);
        setContent(newContent);
        setTimeout(() => {
          textarea.setSelectionRange(lineStart, lineStart);
        }, 10);
        return;
      }

      // Check for active todo item "- [ ] item" -> auto continue with "- [ ] "
      if (/^-\s+\[([ xX])\]\s+.+/.test(currentLine)) {
        e.preventDefault();
        const insertion = '\n- [ ] ';
        const newContent = text.substring(0, start) + insertion + text.substring(start);
        setContent(newContent);
        setTimeout(() => {
          textarea.setSelectionRange(start + insertion.length, start + insertion.length);
        }, 10);
        return;
      }

      // Check for empty bullet item "- " -> pressing Enter exits list
      if (/^[-*+]\s*$/.test(currentLine)) {
        e.preventDefault();
        const newContent = text.substring(0, lineStart) + text.substring(start);
        setContent(newContent);
        setTimeout(() => {
          textarea.setSelectionRange(lineStart, lineStart);
        }, 10);
        return;
      }

      // Check for active bullet item "- item" -> auto continue with "- "
      if (/^[-*+]\s+.+/.test(currentLine)) {
        e.preventDefault();
        const insertion = '\n- ';
        const newContent = text.substring(0, start) + insertion + text.substring(start);
        setContent(newContent);
        setTimeout(() => {
          textarea.setSelectionRange(start + insertion.length, start + insertion.length);
        }, 10);
        return;
      }

      // Check for quote "> "
      if (/^>\s*$/.test(currentLine)) {
        e.preventDefault();
        const newContent = text.substring(0, lineStart) + text.substring(start);
        setContent(newContent);
        setTimeout(() => {
          textarea.setSelectionRange(lineStart, lineStart);
        }, 10);
        return;
      }
      if (/^>\s+.+/.test(currentLine)) {
        e.preventDefault();
        const insertion = '\n> ';
        const newContent = text.substring(0, start) + insertion + text.substring(start);
        setContent(newContent);
        setTimeout(() => {
          textarea.setSelectionRange(start + insertion.length, start + insertion.length);
        }, 10);
        return;
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const indent = '  '; // 2 spaces
      const newContent = content.substring(0, start) + indent + content.substring(end);
      setContent(newContent);
      setTimeout(() => {
        textarea.setSelectionRange(start + indent.length, start + indent.length);
      }, 10);
    }
  };

  // 4. Intercept Image Pastes (Prevents gigantic Base64 strings from ruining editor performance)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Check for clipboard image files
    const items = e.clipboardData?.items;
    let hasImageFile = false;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          hasImageFile = true;
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              if (base64) {
                setImages((prev) => [...prev, base64]);
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    }

    if (hasImageFile) {
      e.preventDefault();
      return;
    }

    // Check for pasted text containing base64 data URLs
    const pastedText = e.clipboardData?.getData('text');
    if (pastedText && pastedText.includes('data:image/')) {
      const base64Regex = /!\[(.*?)\]\((data:image\/[a-zA-Z]+;base64,[^)]+)\)/g;
      const extracted: string[] = [];
      let match;
      while ((match = base64Regex.exec(pastedText)) !== null) {
        extracted.push(match[2]);
      }
      if (extracted.length > 0) {
        e.preventDefault();
        setImages((prev) => [...prev, ...extracted]);
        const cleanPasted = pastedText.replace(base64Regex, '').trim();
        const textarea = textareaRef.current;
        if (textarea && cleanPasted) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newContent = content.substring(0, start) + cleanPasted + content.substring(end);
          setContent(newContent);
          setTimeout(() => {
            textarea.setSelectionRange(start + cleanPasted.length, start + cleanPasted.length);
          }, 10);
        }
      }
    }
  };

  // 5. Image File Upload (Stored in images array, rendered as thumbnails)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          setImages((prev) => [...prev, base64]);
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const removeImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // 6. Handle Link reference insertion
  const handleSelectReference = (targetNote: Note) => {
    const linkSyntax = `[[${targetNote.id}|${targetNote.title || '便签'}]]`;
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((prev) => prev + ' ' + linkSyntax);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.substring(0, start) + linkSyntax + content.substring(end);
    setContent(newContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + linkSyntax.length, start + linkSyntax.length);
    }, 10);
  };

  // 7. Import Markdown (.md) file into current editor
  const handleImportMdIntoEditor = async () => {
    const res = await importMarkdownFile();
    if (!res.success || res.cancelled || typeof res.content !== 'string') {
      return;
    }

    const parsed = parseImportedMarkdown(res.filename || '', res.content);
    if (!title.trim() && parsed.title) {
      setTitle(parsed.title);
    }
    if (parsed.images.length > 0) {
      setImages((prev) => [...prev, ...parsed.images]);
    }
    setContent((prev) => (prev.trim() ? `${prev}\n\n${parsed.content}` : parsed.content));
  };

  const handleSave = async () => {
    const finalTitle = title.trim() || '无标题便签';
    const finalCommit =
      commitMessage.trim() ||
      (note ? `更新便签「${finalTitle}」` : `创建新便签「${finalTitle}」`);

    await onSave(
      {
        id: note?.id,
        projectId,
        title: finalTitle,
        content,
        pinned,
        images,
      },
      finalCommit
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-scale">
      <div
        className="w-full h-full sm:h-[90vh] sm:max-w-3xl bg-white dark:bg-zinc-900 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/80 dark:border-zinc-800 animate-slide-up-spring"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Editor Top Bar with Safe Area */}
        <div
          className="px-4 py-2.5 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-900/90 backdrop-blur"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.625rem)',
          }}
        >
          {/* Left: Close Button */}
          <button
            onClick={onClose}
            className="touch-press w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-200/80 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 transition-colors"
            title="取消编辑"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Right: Preview Toggle & Save Button */}
          <div className="flex items-center gap-2">
            {/* Preview Toggle Button */}
            <button
              onClick={() => setIsPreview(!isPreview)}
              className={`touch-press flex items-center gap-1.5 px-3 h-8 rounded-xl font-medium text-xs transition-all ${
                isPreview
                  ? 'bg-theme/15 text-theme ring-1 ring-theme/30'
                  : 'text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200/70 dark:hover:bg-zinc-700'
              }`}
              title={isPreview ? '返回编辑' : 'Markdown 预览'}
            >
              {isPreview ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{isPreview ? '编辑' : '预览'}</span>
            </button>

            {/* Save Button */}
            <button
              onClick={handleSave}
              className="touch-press flex items-center gap-1.5 px-3.5 h-8 rounded-xl bg-theme hover:brightness-95 text-white font-medium text-xs shadow-sm active:scale-95 transition-all shrink-0"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>保存</span>
            </button>
          </div>
        </div>

        {/* Note Attributes Bar: Project, Pin & Git Commit Pills */}
        <div className="px-5 pt-3 pb-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {/* Project Selector Pill */}
          <div className="relative inline-flex items-center shrink-0">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="appearance-none touch-press text-xs font-medium pl-3 pr-7 py-1.5 rounded-xl bg-slate-100/90 dark:bg-zinc-800/90 border border-slate-200/80 dark:border-zinc-700/80 text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-theme/30 max-w-[180px] truncate"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  📁 {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2 pointer-events-none text-slate-400" />
          </div>

          {/* Pin Toggle Pill */}
          <button
            onClick={() => setPinned(!pinned)}
            className={`touch-press flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl transition-all shrink-0 border ${
              pinned
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                : 'bg-slate-100/90 dark:bg-zinc-800/90 text-slate-600 dark:text-zinc-400 border-slate-200/80 dark:border-zinc-700/80 hover:bg-slate-200/60 dark:hover:bg-zinc-700/60'
            }`}
            title={pinned ? '取消置顶' : '置顶此便签'}
          >
            <Pin className={`w-3.5 h-3.5 ${pinned ? 'fill-current' : ''}`} />
            <span>{pinned ? '已置顶' : '置顶'}</span>
          </button>

          {/* Git Commit Message Pill */}
          <button
            onClick={() => setShowCommitInput(!showCommitInput)}
            className={`touch-press flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl transition-all shrink-0 border ${
              showCommitInput || commitMessage
                ? 'bg-theme/15 text-theme border-theme/30'
                : 'bg-slate-100/90 dark:bg-zinc-800/90 text-slate-600 dark:text-zinc-400 border-slate-200/80 dark:border-zinc-700/80 hover:bg-slate-200/60 dark:hover:bg-zinc-700/60'
            }`}
            title="添加修改备注 (Git Commit Message)"
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>{commitMessage ? '已填备注' : '修改备注'}</span>
          </button>
        </div>

        {/* Optional Git Commit Message Input Field */}
        {showCommitInput && (
          <div className="mx-5 my-2 px-3.5 py-2 rounded-xl bg-theme/5 dark:bg-theme/10 border border-theme/20 flex items-center gap-2 animate-fadeIn">
            <GitCommit className="w-4 h-4 text-theme shrink-0" />
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="输入本次修改备注 (如：修改待办事项、补充设计要点)..."
              className="w-full text-xs bg-transparent border-0 focus:outline-none text-slate-800 dark:text-zinc-200 placeholder:text-slate-400"
              autoFocus
            />
          </div>
        )}

        {/* Title Input */}
        <div className="px-5 pt-3 pb-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="便签标题..."
            className="w-full text-xl sm:text-2xl font-bold bg-transparent border-0 focus:outline-none text-slate-900 dark:text-zinc-100 placeholder:text-slate-300 dark:placeholder:text-zinc-600"
          />
        </div>

        {/* Markdown Action Toolbar (with onMouseDown preventDefault to prevent keyboard blur) */}
        {!isPreview && (
          <div className="px-3 py-1.5 border-y border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center gap-2 overflow-x-auto text-slate-600 dark:text-zinc-300 select-none no-scrollbar">
            {/* H1 */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleLinePrefix('# ')}
              className="touch-press px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-xs font-semibold"
              title="切换一级标题"
            >
              H<sub className="text-[10px]">1</sub>
            </button>
            {/* H2 */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleLinePrefix('## ')}
              className="touch-press px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-xs font-semibold"
              title="切换二级标题"
            >
              H<sub className="text-[10px]">2</sub>
            </button>
            <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-700 mx-0.5 shrink-0" />

            {/* Bold */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => wrapSelection('**', '粗体')}
              className="touch-press px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-bold text-xs"
              title="粗体"
            >
              B
            </button>
            {/* Italic */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => wrapSelection('*', '斜体')}
              className="touch-press px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 italic font-serif text-xs"
              title="斜体"
            >
              I
            </button>
            {/* Strikethrough */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => wrapSelection('~~', '删除线')}
              className="touch-press px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 line-through text-xs"
              title="删除线"
            >
              S
            </button>
            <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-700 mx-0.5 shrink-0" />

            {/* Checkbox */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleLinePrefix('- [ ] ')}
              className="touch-press p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800"
              title="切换待办清单"
            >
              <CheckSquare className="w-4 h-4 text-blue-500" />
            </button>
            {/* List */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleLinePrefix('- ')}
              className="touch-press p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800"
              title="切换无序列表"
            >
              <List className="w-4 h-4" />
            </button>
            {/* Quote */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleLinePrefix('> ')}
              className="touch-press p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800"
              title="切换引用块"
            >
              <Quote className="w-4 h-4" />
            </button>
            {/* Code */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => wrapSelection('`', '代码')}
              className="touch-press p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 font-mono text-xs"
              title="行内代码"
            >
              &lt;&gt;
            </button>
            <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-700 mx-0.5 shrink-0" />

            {/* Reference */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setIsRefPickerOpen(true)}
              className="touch-press flex items-center gap-1 px-2 py-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 font-medium text-xs shrink-0 transition-colors"
              title="引用其他项目/便签记录"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>引用便签</span>
            </button>

            {/* Upload Image */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="touch-press flex items-center gap-1 px-2 py-1 rounded text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 font-medium text-xs shrink-0 transition-colors"
              title="插入图片 (缩略图展示，不污染正文)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>添加图片</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />

            {/* Import Markdown File */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleImportMdIntoEditor}
              className="touch-press flex items-center gap-1 px-2 py-1 rounded text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 font-medium text-xs shrink-0 transition-colors"
              title="从本地导入 Markdown (.md) 文件到当前便签"
            >
              <FileUp className="w-3.5 h-3.5 text-theme" />
              <span>导入 .md</span>
            </button>
          </div>
        )}

        {/* Content Area: Editor or Preview */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col">
          {isPreview ? (
            <div className="max-w-none flex-1">
              <MarkdownRenderer content={content} />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="撰写 Markdown 内容，支持待办清单、标题、代码与便签双链引用..."
              className="w-full flex-1 min-h-[260px] bg-transparent border-0 focus:outline-none text-slate-800 dark:text-zinc-200 text-sm leading-relaxed resize-none font-sans"
            />
          )}

          {/* Clean Image Gallery (Display thumbnails directly! No long base64 text in editor!) */}
          {images.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800/80">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-theme" />
                  图片附件 ({images.length} 张)
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="touch-press text-xs font-medium text-theme flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  继续添加
                </button>
              </div>

              {/* Thumbnails Row */}
              <div className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
                {images.map((imgSrc, idx) => (
                  <div
                    key={idx}
                    className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-slate-200/80 dark:border-zinc-700/80 group shadow-xs bg-slate-100 dark:bg-zinc-800"
                  >
                    <img
                      src={imgSrc}
                      alt={`附件图片 ${idx + 1}`}
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => setPreviewImage(imgSrc)}
                    />
                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="touch-press absolute top-1 right-1 w-5 h-5 rounded-md bg-black/60 hover:bg-rose-600 text-white flex items-center justify-center shadow-xs transition-colors"
                      title="删除此图片"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Large Image Lightbox Preview */}
        {previewImage && (
          <div
            className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-scale"
            onClick={() => setPreviewImage(null)}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-5 right-5 p-2 rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImage}
              alt="全屏图片预览"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Reference Picker Modal */}
        <ReferencePickerModal
          isOpen={isRefPickerOpen}
          onClose={() => setIsRefPickerOpen(false)}
          notes={allNotes}
          projects={projects}
          currentNoteId={note?.id}
          onSelectNote={handleSelectReference}
        />
      </div>
    </div>
  );
};
