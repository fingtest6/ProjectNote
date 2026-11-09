import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

/**
 * Native Android Exporter & Importer Plugin Bridge
 * - saveImageToPictures: Directly saves PNG into Android public Pictures/ProjectNotes folder via MediaStore (no share popup).
 * - saveMarkdownFile: Opens Android's native system file-save interface (ACTION_CREATE_DOCUMENT) for .md files.
 * - pickMarkdownFile: Opens Android's native system file-open interface (ACTION_OPEN_DOCUMENT) to import .md files.
 */
interface NativeExporterPlugin {
  saveImageToPictures(options: {
    filename: string;
    base64Data: string;
  }): Promise<{ success: boolean; path?: string; uri?: string }>;

  saveMarkdownFile(options: {
    filename: string;
    content: string;
  }): Promise<{ success: boolean; cancelled?: boolean; path?: string; uri?: string }>;

  pickMarkdownFile(): Promise<{
    success: boolean;
    cancelled?: boolean;
    filename?: string;
    content?: string;
  }>;
}

const NativeExporter = registerPlugin<NativeExporterPlugin>('NativeExporter');

export function sanitizeFilename(name: string, ext: string): string {
  const cleaned = (name || '便签')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim();
  const base = cleaned || '便签';
  return base.toLowerCase().endsWith(ext.toLowerCase()) ? base : `${base}${ext}`;
}

// Convert DataURL to clean base64 data
export function getCleanBase64(dataUrl: string): string {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

// Convert DataURL to Blob
export function dataURLToBlob(dataURL: string): Blob {
  const parts = dataURL.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

// Download file via Blob (Web fallback)
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 60000);
}

/**
 * Strictly check whether a filename has a Markdown or plain text extension
 */
export function isValidMarkdownOrTxtFile(name: string): boolean {
  return /\.(md|markdown|txt)$/i.test(name.trim());
}

/**
 * Import a Markdown (.md / .markdown / .txt) file via Android Native File Picker (ACTION_OPEN_DOCUMENT)
 * or HTML file input fallback. Strictly rejects images and non-document formats.
 */
export async function importMarkdownFile(): Promise<{
  success: boolean;
  cancelled?: boolean;
  filename?: string;
  content?: string;
}> {
  // 1. Android Native App mode
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await NativeExporter.pickMarkdownFile();
      if (res.cancelled) {
        return { success: false, cancelled: true };
      }
      if (res.success && typeof res.content === 'string') {
        const fname = res.filename || '导入便签.md';
        if (!isValidMarkdownOrTxtFile(fname)) {
          alert(`格式不支持：文件「${fname}」不是 Markdown (.md) 或文本 (.txt) 文件，已阻止导入！`);
          return { success: false, cancelled: true };
        }
        return {
          success: true,
          filename: fname,
          content: res.content,
        };
      }
    } catch (nativeErr: any) {
      if (nativeErr?.message && nativeErr.message.includes('INVALID_FILE_TYPE')) {
        alert('格式不支持：仅允许导入 Markdown (.md) 或纯文本 (.txt) 文件，已自动阻止图片或其他格式！');
        return { success: false, cancelled: true };
      }
      console.warn('NativeExporter.pickMarkdownFile fallback to input element:', nativeErr);
    }
  }

  // 2. Web / HTML <input type="file"> fallback (Windows / Browser)
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
    input.style.display = 'none';
    document.body.appendChild(input);

    let resolved = false;
    const cleanup = () => {
      try {
        document.body.removeChild(input);
      } catch {
        // ignore
      }
    };

    input.onchange = () => {
      resolved = true;
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve({ success: false, cancelled: true });
        return;
      }

      // Strictly check file extension on Windows/Web
      if (!isValidMarkdownOrTxtFile(file.name)) {
        cleanup();
        alert(`格式不支持：文件「${file.name}」不是 Markdown (.md) 或文本 (.txt) 文件，已自动阻止导入！`);
        resolve({ success: false, cancelled: true });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        cleanup();
        const text = typeof e.target?.result === 'string' ? e.target.result : '';
        resolve({
          success: true,
          filename: file.name,
          content: text,
        });
      };
      reader.onerror = () => {
        cleanup();
        resolve({ success: false });
      };
      reader.readAsText(file, 'utf-8');
    };

    input.oncancel = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ success: false, cancelled: true });
      }
    };

    input.click();
  });
}

/**
 * Parse imported Markdown filename and raw content into clean note title, body, and extracted images.
 */
export function parseImportedMarkdown(
  filename: string,
  rawContent: string
): {
  title: string;
  content: string;
  images: string[];
} {
  let text = (rawContent || '').replace(/\r\n/g, '\n');
  const images: string[] = [];

  // Extract embedded Base64 images so they render in the thumbnail gallery instead of clogging text
  const base64Regex = /!\[(.*?)\]\((data:image\/[a-zA-Z]+;base64,[^)]+)\)/g;
  let match;
  while ((match = base64Regex.exec(text)) !== null) {
    if (!images.includes(match[2])) {
      images.push(match[2]);
    }
  }
  text = text.replace(base64Regex, '').trim();

  // Derive title from filename (strip .md / .markdown / .txt)
  const fileTitle = (filename || '')
    .replace(/\.(md|markdown|txt)$/i, '')
    .trim();

  let title = fileTitle || '导入便签';

  // Check if the first line of the Markdown is a top-level H1 heading (# Heading)
  const lines = text.split('\n');
  const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmptyIdx !== -1) {
    const firstLine = lines[firstNonEmptyIdx].trim();
    const h1Match = firstLine.match(/^#\s+(.+)$/);
    if (h1Match) {
      const headingTitle = h1Match[1].trim();
      if (!fileTitle || fileTitle === '导入便签' || fileTitle === headingTitle) {
        title = headingTitle;
        lines.splice(firstNonEmptyIdx, 1);
        text = lines.join('\n').trim();
      }
    }
  }

  return {
    title: title || '导入便签',
    content: text,
    images,
  };
}

/**
 * Export Markdown file via Android Native File Save Interface (SAF ACTION_CREATE_DOCUMENT)
 * or direct Documents storage / Web file save picker. No Share sheet popup.
 */
export async function exportTextFile(
  filename: string,
  content: string
): Promise<{ success: boolean; method: string; path?: string }> {
  const safeFilename = sanitizeFilename(filename, '.md');

  // 1. Android Native App mode
  if (Capacitor.isNativePlatform()) {
    // Primary: Android system file save dialog (Intent.ACTION_CREATE_DOCUMENT)
    try {
      const res = await NativeExporter.saveMarkdownFile({
        filename: safeFilename,
        content,
      });
      if (res.cancelled) {
        return { success: false, method: 'cancelled' };
      }
      if (res.success) {
        return {
          success: true,
          method: 'android-saf',
          path: res.path || res.uri,
        };
      }
    } catch (nativeErr) {
      console.warn('NativeExporter.saveMarkdownFile fallback to Filesystem:', nativeErr);
    }

    // Fallback: Direct write to Android Documents/ProjectNotes folder (without Share popup)
    try {
      const writeResult = await Filesystem.writeFile({
        path: `ProjectNotes/${safeFilename}`,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      return {
        success: true,
        method: 'native-documents',
        path: `Documents/ProjectNotes/${safeFilename}` || writeResult.uri,
      };
    } catch (fsErr) {
      console.error('Filesystem write failed:', fsErr);
      return { success: false, method: 'failed' };
    }
  }

  // 2. Web File System Access API (Save File Picker if supported)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: safeFilename,
        types: [
          {
            description: 'Markdown 文档',
            accept: { 'text/markdown': ['.md'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return { success: true, method: 'file-picker', path: safeFilename };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { success: false, method: 'cancelled' };
      }
    }
  }

  // 3. Direct browser download fallback
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, safeFilename);
    return { success: true, method: 'download', path: safeFilename };
  } catch {
    return { success: false, method: 'failed' };
  }
}

/**
 * Directly save exported card image into local Pictures folder (Pictures/ProjectNotes)
 * without opening any Share sheet.
 */
export async function exportImageFile(
  filename: string,
  dataUrl: string
): Promise<{ success: boolean; method: string; path?: string }> {
  const baseName = (filename || '便签卡片').replace(/\.png$/i, '');
  const uniqueName = sanitizeFilename(`${baseName}_${Date.now().toString().slice(-5)}`, '.png');
  const cleanBase64 = getCleanBase64(dataUrl);

  // 1. Android Native App mode
  if (Capacitor.isNativePlatform()) {
    // Primary: Save directly to Android Public Pictures/ProjectNotes via MediaStore
    try {
      const res = await NativeExporter.saveImageToPictures({
        filename: uniqueName,
        base64Data: cleanBase64,
      });
      if (res.success) {
        return {
          success: true,
          method: 'pictures-saved',
          path: res.path || `Pictures/ProjectNotes/${uniqueName}`,
        };
      }
    } catch (nativeErr) {
      console.warn('NativeExporter.saveImageToPictures fallback to Filesystem:', nativeErr);
    }

    // Fallback: Direct write via Capacitor Filesystem to ExternalStorage Pictures or Documents (NO Share popup)
    try {
      await Filesystem.writeFile({
        path: `Pictures/ProjectNotes/${uniqueName}`,
        data: cleanBase64,
        directory: Directory.ExternalStorage,
        recursive: true,
      });
      return {
        success: true,
        method: 'pictures-saved',
        path: `Pictures/ProjectNotes/${uniqueName}`,
      };
    } catch {
      try {
        await Filesystem.writeFile({
          path: `Pictures/${uniqueName}`,
          data: cleanBase64,
          directory: Directory.Documents,
          recursive: true,
        });
        return {
          success: true,
          method: 'documents-pictures-saved',
          path: `Documents/Pictures/${uniqueName}`,
        };
      } catch (err) {
        console.error('Capacitor image save failed:', err);
        return { success: false, method: 'failed' };
      }
    }
  }

  // 2. Web direct download (no Share sheet)
  try {
    const blob = dataURLToBlob(dataUrl);
    downloadBlob(blob, uniqueName);
    return { success: true, method: 'download', path: uniqueName };
  } catch {
    return { success: false, method: 'failed' };
  }
}

// Universal clipboard copy fallback
export async function copyTextFallback(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  let successful = false;
  try {
    successful = document.execCommand('copy');
  } catch {
    successful = false;
  }

  document.body.removeChild(textArea);
  return successful;
}
