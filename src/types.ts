export interface Project {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  isDefault?: boolean;
}

export interface Note {
  id: string;
  projectId: string;
  title: string;
  content: string;
  images: string[]; // Base64 data URLs or asset paths
  pinned: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface NoteHistory {
  id: string;
  noteId: string;
  version: number;
  commitMessage: string;
  title: string;
  content: string;
  timestamp: number;
  charCount: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeConfig {
  mode: ThemeMode;
  primaryColor: string; // e.g., '#10b981'
  presetId: string;
}

export interface NoteReference {
  targetId: string;
  targetTitle: string;
  snippet?: string;
}

export interface VaultConfig {
  enabled: boolean;
  type: 'electron-fs' | 'browser-fs' | 'android-fs' | 'none';
  folderPath: string; // Directory path or handle name
  autoExportOnSave: boolean;
  lastSyncedAt?: number;
}

export interface SyncPayload {
  deviceId: string;
  deviceName: string;
  timestamp: number;
  projects: Project[];
  notes: Note[];
  histories: NoteHistory[];
}

export type SyncMode = 'smart-merge' | 'push-overwrite' | 'pull-overwrite' | 'new-only';

export interface SyncResult {
  success: boolean;
  accepted?: boolean;
  mode?: SyncMode;
  /** 本机在本次同步中的位置：发起方（initiator）或接收方（receiver），用于正确描述覆盖方向 */
  perspective?: 'initiator' | 'receiver';
  pulledNotes: number;
  pushedNotes: number;
  pulledProjects: number;
  pushedProjects: number;
  newNotesAdded?: number;
  historiesSynced?: number;
  message?: string;
  details?: string[];
}

export interface SyncConfirmationRequest {
  id: number;
  from: {
    deviceId: string;
    deviceName: string;
  };
  mode: SyncMode;
  summary?: {
    noteCount: number;
    projectCount: number;
  };
  payload: SyncPayload;
}

declare module 'jsqr' {
  export interface QRCodeResult {
    data: string;
    binaryData: number[];
    location: {
      topRightCorner: { x: number; y: number };
      topLeftCorner: { x: number; y: number };
      bottomRightCorner: { x: number; y: number };
      bottomLeftCorner: { x: number; y: number };
    };
  }
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }
  ): QRCodeResult | null;
}
