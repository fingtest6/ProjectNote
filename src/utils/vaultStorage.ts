import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { Note, Project, VaultConfig } from '../types';

const VAULT_STORAGE_KEY = 'project_notes_vault_config';
let browserDirectoryHandle: FileSystemDirectoryHandle | null = null;

// Frontmatter parsing and stringifying helper
export function noteToMarkdown(note: Note, project?: Project): string {
  const frontmatter = [
    '---',
    `id: ${JSON.stringify(note.id)}`,
    `projectId: ${JSON.stringify(note.projectId)}`,
    `projectName: ${JSON.stringify(project?.name || '默认项目')}`,
    `title: ${JSON.stringify(note.title)}`,
    `pinned: ${note.pinned}`,
    `tags: ${JSON.stringify(note.tags || [])}`,
    `createdAt: ${note.createdAt}`,
    `updatedAt: ${note.updatedAt}`,
    '---',
    '',
  ].join('\n');

  let body = note.content || '';
  if (note.images && note.images.length > 0) {
    const imgSection = [
      '\n\n<!-- ATTACHED_IMAGES_START -->',
      ...note.images.map((src, i) => `![附件图片 ${i + 1}](${src})`),
      '<!-- ATTACHED_IMAGES_END -->\n',
    ].join('\n');
    body += imgSection;
  }

  return frontmatter + body;
}

export function parseMarkdownToNote(rawText: string, defaultProjectId: string): Partial<Note> & { projectName?: string } {
  let content = rawText;
  let metadata: Record<string, any> = {};

  if (rawText.startsWith('---')) {
    const endIdx = rawText.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const yamlBlock = rawText.slice(3, endIdx).trim();
      content = rawText.slice(endIdx + 4).trim();

      yamlBlock.split('\n').forEach((line) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          let val = line.slice(colonIdx + 1).trim();
          try {
            val = JSON.parse(val);
          } catch {
            // keep raw string if not json parseable
          }
          metadata[key] = val;
        }
      });
    }
  }

  // Extract images if preserved
  const images: string[] = [];
  const imgRegex = /!\[.*?\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    images.push(match[1]);
  }
  // Strip attached image markers if present
  content = content.replace(/<!-- ATTACHED_IMAGES_START -->[\s\S]*?<!-- ATTACHED_IMAGES_END -->/g, '').trim();

  return {
    id: metadata.id || `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectId: metadata.projectId || defaultProjectId,
    title: metadata.title || '导入便签',
    content,
    images: metadata.images || images,
    pinned: Boolean(metadata.pinned),
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    createdAt: Number(metadata.createdAt) || Date.now(),
    updatedAt: Number(metadata.updatedAt) || Date.now(),
    projectName: metadata.projectName,
  };
}

function sanitizeFilename(name: string): string {
  return (name || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
}

// Vault configuration management
export function getVaultConfig(): VaultConfig {
  try {
    const stored = localStorage.getItem(VAULT_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (err) {
    console.error('Failed to read vault config:', err);
  }

  const isElectron = Boolean((window as any).electronAPI);
  const isAndroid = Capacitor.getPlatform() === 'android';

  return {
    enabled: isElectron || isAndroid,
    type: isElectron ? 'electron-fs' : isAndroid ? 'android-fs' : 'none',
    folderPath: isElectron ? 'D:\\ProjectNotesVault' : isAndroid ? 'Documents/ProjectNotes' : '',
    autoExportOnSave: true,
  };
}

export function saveVaultConfig(cfg: VaultConfig): void {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(cfg));
}

/**
 * Manually update external vault path (supported on Android, Web, and PC)
 */
export function updateVaultFolderPath(folderPath: string): VaultConfig {
  const cfg = getVaultConfig();
  cfg.enabled = true;
  cfg.folderPath = folderPath.trim();
  if (Capacitor.getPlatform() === 'android') {
    cfg.type = 'android-fs';
  } else if ((window as any).electronAPI) {
    cfg.type = 'electron-fs';
  } else {
    cfg.type = 'browser-fs';
  }
  saveVaultConfig(cfg);
  return cfg;
}

// Choose external folder
export async function pickVaultFolder(defaultPath?: string): Promise<string | null> {
  // 1. Electron environment
  if ((window as any).electronAPI?.selectVaultFolder) {
    const chosenPath = await (window as any).electronAPI.selectVaultFolder();
    if (chosenPath) {
      const cfg = getVaultConfig();
      cfg.enabled = true;
      cfg.type = 'electron-fs';
      cfg.folderPath = chosenPath;
      saveVaultConfig(cfg);
      return chosenPath;
    }
    return null;
  }

  // 2. Android Capacitor environment (supports setting customized folder)
  if (Capacitor.getPlatform() === 'android') {
    const chosenPath = defaultPath || 'Documents/ProjectNotes';
    const cfg = getVaultConfig();
    cfg.enabled = true;
    cfg.type = 'android-fs';
    cfg.folderPath = chosenPath;
    saveVaultConfig(cfg);
    return chosenPath;
  }

  // 3. Browser File System Access API
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await (window as any).showDirectoryPicker({
        id: 'project-notes-vault',
        mode: 'readwrite',
      });
      if (handle) {
        browserDirectoryHandle = handle;
        const cfg = getVaultConfig();
        cfg.enabled = true;
        cfg.type = 'browser-fs';
        cfg.folderPath = handle.name || '本地笔记文件夹';
        saveVaultConfig(cfg);
        return cfg.folderPath;
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Directory picker error:', err);
      }
    }
  }

  if (defaultPath) {
    const cfg = updateVaultFolderPath(defaultPath);
    return cfg.folderPath;
  }

  return null;
}

// Save single note to external vault
export async function writeNoteToExternalVault(note: Note, project?: Project): Promise<boolean> {
  const cfg = getVaultConfig();
  if (!cfg.enabled) return false;

  const mdText = noteToMarkdown(note, project);
  const safeProj = sanitizeFilename(project?.name || '默认项目');
  const safeTitle = sanitizeFilename(note.title || '便签');
  const filename = `${safeTitle}.md`;

  try {
    // 1. Electron
    if (cfg.type === 'electron-fs' && (window as any).electronAPI?.writeVaultFile) {
      await (window as any).electronAPI.writeVaultFile({
        folderPath: cfg.folderPath,
        projectDir: safeProj,
        filename,
        content: mdText,
      });
      return true;
    }

    // 2. Android Capacitor (Cleanly maps without duplicated Documents/Documents)
    if (cfg.type === 'android-fs' || Capacitor.getPlatform() === 'android') {
      let rawFolder = (cfg.folderPath || 'Documents/ProjectNotes').replace(/\\/g, '/').replace(/^\/+/, '');
      let relDir = rawFolder;
      if (relDir.toLowerCase().startsWith('documents/')) {
        relDir = relDir.slice(10);
      } else if (relDir.toLowerCase() === 'documents') {
        relDir = '';
      }
      const relativePath = relDir ? `${relDir}/${safeProj}/${filename}` : `${safeProj}/${filename}`;
      await Filesystem.writeFile({
        path: relativePath,
        data: mdText,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      return true;
    }

    // 3. Browser File System Access API
    if (cfg.type === 'browser-fs' && browserDirectoryHandle) {
      const projDirHandle = await browserDirectoryHandle.getDirectoryHandle(safeProj, { create: true });
      const fileHandle = await projDirHandle.getFileHandle(filename, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(mdText);
      await writable.close();
      return true;
    }
  } catch (err) {
    console.error('Failed to write note to external vault:', err);
  }

  return false;
}

// Delete note from external vault
export async function deleteNoteFromExternalVault(noteTitle: string, projectName: string): Promise<boolean> {
  const cfg = getVaultConfig();
  if (!cfg.enabled) return false;

  const safeProj = sanitizeFilename(projectName || '默认项目');
  const safeTitle = sanitizeFilename(noteTitle || '便签');
  const filename = `${safeTitle}.md`;

  try {
    if (cfg.type === 'electron-fs' && (window as any).electronAPI?.deleteVaultFile) {
      await (window as any).electronAPI.deleteVaultFile({
        folderPath: cfg.folderPath,
        projectDir: safeProj,
        filename,
      });
      return true;
    }

    if (cfg.type === 'android-fs' || Capacitor.getPlatform() === 'android') {
      let rawFolder = (cfg.folderPath || 'Documents/ProjectNotes').replace(/\\/g, '/').replace(/^\/+/, '');
      let relDir = rawFolder;
      if (relDir.toLowerCase().startsWith('documents/')) {
        relDir = relDir.slice(10);
      } else if (relDir.toLowerCase() === 'documents') {
        relDir = '';
      }
      const relativePath = relDir ? `${relDir}/${safeProj}/${filename}` : `${safeProj}/${filename}`;
      await Filesystem.deleteFile({
        path: relativePath,
        directory: Directory.Documents,
      });
      return true;
    }
  } catch (err) {
    // File might already not exist
  }

  return false;
}

// Full export all notes to external vault
export async function exportAllToExternalVault(projects: Project[], notes: Note[]): Promise<{ count: number; path: string }> {
  const cfg = getVaultConfig();
  const projMap = new Map(projects.map((p) => [p.id, p]));
  let count = 0;

  for (const n of notes) {
    const p = projMap.get(n.projectId);
    const ok = await writeNoteToExternalVault(n, p);
    if (ok) count++;
  }

  cfg.lastSyncedAt = Date.now();
  saveVaultConfig(cfg);

  return { count, path: cfg.folderPath };
}
