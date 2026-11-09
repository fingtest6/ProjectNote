import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, StickyNote, FileUp } from 'lucide-react';
import { db, initSeedData, purgeExpiredTombstones } from './db';
import type { Note, Project, NoteHistory } from './types';
import { importMarkdownFile, parseImportedMarkdown } from './utils/exporter';
import { Header } from './components/Header';
import { ProjectDrawer } from './components/ProjectDrawer';
import { NoteCard } from './components/NoteCard';
import { NoteEditor } from './components/NoteEditor';
import { NoteDetailModal } from './components/NoteDetailModal';
import { GitDiffModal } from './components/GitDiffModal';
import { ExportModal } from './components/ExportModal';
import { ThemeModal } from './components/ThemeModal';
import { SyncVaultModal } from './components/SyncVaultModal';
import { SyncConfirmationModal } from './components/SyncConfirmationModal';
import { SyncReportModal } from './components/SyncReportModal';
import { useMobileBackHandler } from './hooks/useMobileBackHandler';
import { writeNoteToExternalVault, deleteNoteFromExternalVault } from './utils/vaultStorage';
import {
  handleServerIncomingSync,
  generateLocalSyncPayload,
  getLastSyncTarget,
  syncWithRemoteServer,
  pollDeviceTask,
} from './utils/syncProtocol';
import type { SyncConfirmationRequest, SyncMode, SyncResult } from './types';

/**
 * 电脑端主动发起同步时，模式是以「电脑」为视角选择的；手机端真正执行时要换算成自己的视角：
 *  - 电脑端「以电脑为准覆盖手机」 == 手机端「拉取电脑数据并覆盖本机」
 *  - 电脑端「以手机为准覆盖电脑」 == 手机端「推送本机数据并覆盖电脑」
 */
const translateInviteMode = (mode: SyncMode): SyncMode => {
  if (mode === 'push-overwrite') return 'pull-overwrite';
  if (mode === 'pull-overwrite') return 'push-overwrite';
  return mode;
};

export const App: React.FC = () => {
  // Initialize Database Seed on first mount
  useEffect(() => {
    (async () => {
      await initSeedData();
      await purgeExpiredTombstones();
    })().catch((err) => console.error('初始化本地数据库失败:', err));
  }, []);

  // Fetch all projects & notes reactively from Dexie
  // 只把「未删除」的数据暴露给界面，墓碑仅用于多端同步传播删除
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deletedAt).toArray()) || [];
  const allNotes = useLiveQuery(() => db.notes.filter((n) => !n.deletedAt).toArray()) || [];

  const STORAGE_KEY_ACTIVE_PROJECT = 'project_notes_saved_project_id';

  // Active project ID state with persistent storage
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT) || '';
  });

  const selectProject = (id: string) => {
    setActiveProjectId(id);
    localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, id);
  };

  // Synchronize active project ID once projects load
  useEffect(() => {
    if (projects.length > 0) {
      const savedId = localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT);
      const isSavedValid = savedId && projects.some((p) => p.id === savedId);

      if (isSavedValid) {
        if (activeProjectId !== savedId) {
          setActiveProjectId(savedId);
        }
      } else if (!projects.some((p) => p.id === activeProjectId)) {
        const defaultProj = projects.find((p) => p.isDefault) || projects[0];
        setActiveProjectId(defaultProj.id);
        localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, defaultProj.id);
      }
    }
  }, [projects, activeProjectId]);

  // Confirmation & Sync Report States
  const [incomingSyncRequest, setIncomingSyncRequest] = useState<SyncConfirmationRequest | null>(null);
  const [activeSyncReport, setActiveSyncReport] = useState<SyncResult | null>(null);
  const handleAcceptSyncRef = React.useRef<((req: SyncConfirmationRequest) => Promise<void>) | null>(null);

  // Bridge for Electron LAN sync server incoming phone requests
  useEffect(() => {
    // 1. In-page global fallback
    (window as any).__getSyncCounts = async () => {
      const pCount = await db.projects.filter((p) => !p.deletedAt).count();
      const nCount = await db.notes.filter((n) => !n.deletedAt).count();
      return { noteCount: nCount, projectCount: pCount };
    };

    (window as any).__handleIncomingPhoneSync = async (
      remotePayload: any,
      mode: any = 'smart-merge'
    ) => {
      console.log('[LAN Sync] Handling incoming phone sync with mode:', mode);
      const stats = await handleServerIncomingSync(remotePayload, mode);
      const localPayload = await generateLocalSyncPayload();
      return {
        ...localPayload,
        stats,
      };
    };

    // 2. Native Electron IPC Listeners
    let removeSyncListener: (() => void) | null = null;
    let removeCountListener: (() => void) | null = null;

    if ((window as any).electronAPI?.onIncomingSync) {
      removeSyncListener = (window as any).electronAPI.onIncomingSync((req: any) => {
        console.log('[LAN Sync IPC] Incoming confirmation request:', req);
        const confReq: SyncConfirmationRequest = {
          id: req.id,
          from: req.from || { deviceId: 'unknown', deviceName: '移动端设备' },
          mode: req.mode || 'smart-merge',
          summary: req.summary,
          payload: req.payload,
        };

        // If this is a mobile reply to an invitation initiated by PC, auto-accept and merge
        if (req.from?.isReplyToInvite) {
          handleAcceptSyncRef.current?.(confReq);
          return;
        }

        // Prompt user on this device for explicit confirmation before syncing!
        setIncomingSyncRequest(confReq);
      });
    }

    if ((window as any).electronAPI?.onGetSyncCounts) {
      removeCountListener = (window as any).electronAPI.onGetSyncCounts(async (req: any) => {
        try {
          const pCount = await db.projects.filter((p) => !p.deletedAt).count();
          const nCount = await db.notes.filter((n) => !n.deletedAt).count();
          (window as any).electronAPI.sendSyncResponse(req.id, true, {
            noteCount: nCount,
            projectCount: pCount,
          });
        } catch {
          (window as any).electronAPI.sendSyncResponse(req.id, false, { noteCount: 0, projectCount: 0 });
        }
      });
    }

    return () => {
      delete (window as any).__handleIncomingPhoneSync;
      delete (window as any).__getSyncCounts;
      if (removeSyncListener) removeSyncListener();
      if (removeCountListener) removeCountListener();
    };
  }, []);

  // Handle accepting incoming sync request on this device
  const handleAcceptSync = async (req: SyncConfirmationRequest) => {
    try {
      if (req.from.deviceId === 'pc-server') {
        // 手机端接受了电脑端发起的同步邀请：由手机端向电脑端发起正式同步
        const lastTarget = getLastSyncTarget();
        try {
          const res = await syncWithRemoteServer(lastTarget.serverUrl, lastTarget.pin, req.mode, true);
          setActiveSyncReport(res);
        } finally {
          // 同步期间保持确认弹窗显示「正在同步...」，完成后才关闭
          setIncomingSyncRequest(null);
        }
        return;
      }

      // 正常接收：把对端数据合并进本机
      const stats = await handleServerIncomingSync(req.payload, req.mode);
      const localPayload = await generateLocalSyncPayload();

      // 把本机合并后的完整数据回传给发起方（Electron IPC）
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.sendSyncResponse) {
        electronAPI.sendSyncResponse(req.id, true, {
          ...localPayload,
          stats,
        });
      }

      setIncomingSyncRequest(null);

      // 接收端同样展示一份完整的同步报告
      setActiveSyncReport({
        success: true,
        accepted: true,
        mode: req.mode,
        perspective: 'receiver',
        pulledNotes: stats.pulledNotes,
        pushedNotes: stats.pushedNotes,
        pulledProjects: stats.pulledProjects,
        pushedProjects: stats.pushedProjects,
        newNotesAdded: stats.newNotesAdded,
        historiesSynced: stats.historiesSynced,
        message: `已成功完成与【${req.from.deviceName}】的互联同步！`,
        details: stats.details,
      });
    } catch (e: any) {
      console.error('Accept sync error:', e);
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.sendSyncResponse) {
        electronAPI.sendSyncResponse(req.id, false, null, e.message);
      }
      setIncomingSyncRequest(null);
    }
  };
  handleAcceptSyncRef.current = handleAcceptSync;

  // Handle rejecting incoming sync request
  const handleRejectSync = (req: SyncConfirmationRequest) => {
    if (req.from.deviceId !== 'pc-server') {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.sendSyncResponse) {
        electronAPI.sendSyncResponse(req.id, false, null, '本端用户拒绝了同步请求');
      }
    }
    setIncomingSyncRequest(null);
  };

  // 客户端（手机 / 普通浏览器）：后台轮询电脑端下发的同步邀请
  useEffect(() => {
    const isElectron = Boolean((window as any).electronAPI);
    if (isElectron) return;

    let isMounted = true;
    const controller = new AbortController();
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const startPoll = async () => {
      while (isMounted) {
        const lastTarget = getLastSyncTarget();

        // 还未配置电脑地址时保持等待；之后填好地址无需刷新页面即可自动开始监听
        if (!lastTarget.serverUrl) {
          await wait(3000);
          continue;
        }

        try {
          await pollDeviceTask(
            lastTarget.serverUrl,
            (task) => {
              if (!task || task.type !== 'sync-invitation') return;

              // 电脑端邀请本机同步：必须由本机用户点击确认后才会真正同步
              setIncomingSyncRequest({
                id: Date.now(),
                from: { deviceId: 'pc-server', deviceName: task.from || '电脑端' },
                mode: translateInviteMode(task.mode || 'smart-merge'),
                summary: {
                  noteCount: task.noteCount ?? 0,
                  projectCount: task.projectCount ?? 0,
                },
                payload: {
                  deviceId: 'pc-server',
                  deviceName: task.from || '电脑端',
                  timestamp: Date.now(),
                  projects: [],
                  notes: [],
                  histories: [],
                },
              });
            },
            controller.signal
          );
        } catch {
          await wait(4000);
        }

        await wait(1200);
      }
    };

    startPoll();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === activeProjectId) || null;
  }, [projects, activeProjectId]);

  // Project note counts
  const projectNoteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allNotes.forEach((n) => {
      counts[n.projectId] = (counts[n.projectId] || 0) + 1;
    });
    return counts;
  }, [allNotes]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isGlobalSearch, setIsGlobalSearch] = useState(false);

  // Notes filtered and sorted (supports global and per-project scope)
  const currentNotes = useMemo(() => {
    const baseList = isGlobalSearch && searchQuery.trim()
      ? allNotes
      : allNotes.filter((n) => n.projectId === activeProjectId);

    return baseList
      .filter((n) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Pinned notes come first
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        // Then by updated time descending
        return b.updatedAt - a.updatedAt;
      });
  }, [allNotes, activeProjectId, searchQuery, isGlobalSearch]);

  // Modal States
  const [isProjectDrawerOpen, setIsProjectDrawerOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewingNote, setViewingNote] = useState<Note | null>(null);

  const [isGitDiffOpen, setIsGitDiffOpen] = useState(false);
  const [gitDiffNote, setGitDiffNote] = useState<Note | null>(null);

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportingNote, setExportingNote] = useState<Note | null>(null);
  const [isSyncVaultOpen, setIsSyncVaultOpen] = useState(false);

  // Manage Android system back button / swipe gestures to close modals instead of exiting
  useMobileBackHandler([
    {
      id: 'sync-vault-modal',
      isOpen: isSyncVaultOpen,
      close: () => setIsSyncVaultOpen(false),
    },
    {
      id: 'project-drawer',
      isOpen: isProjectDrawerOpen,
      close: () => setIsProjectDrawerOpen(false),
    },
    {
      id: 'note-detail',
      isOpen: isDetailOpen,
      close: () => {
        setIsDetailOpen(false);
        setViewingNote(null);
      },
    },
    {
      id: 'note-editor',
      isOpen: isEditorOpen,
      close: () => {
        setIsEditorOpen(false);
        setEditingNote(null);
      },
    },
    {
      id: 'git-diff',
      isOpen: isGitDiffOpen,
      close: () => {
        setIsGitDiffOpen(false);
        setGitDiffNote(null);
      },
    },
    {
      id: 'export',
      isOpen: isExportOpen,
      close: () => {
        setIsExportOpen(false);
        setExportingNote(null);
      },
    },
    {
      id: 'theme-modal',
      isOpen: isThemeModalOpen,
      close: () => setIsThemeModalOpen(false),
    },
    {
      id: 'sync-report',
      isOpen: Boolean(activeSyncReport),
      close: () => setActiveSyncReport(null),
    },
    {
      id: 'sync-confirmation',
      isOpen: Boolean(incomingSyncRequest),
      close: () => {
        // 安卓返回键等同于点「拒绝」，避免发起方一直干等到 45 秒超时
        if (incomingSyncRequest) handleRejectSync(incomingSyncRequest);
      },
    },
  ]);

  // Histories for Git Diff modal
  const diffHistories = useLiveQuery(
    async () => {
      if (!gitDiffNote) return [];
      return await db.histories.where('noteId').equals(gitDiffNote.id).toArray();
    },
    [gitDiffNote]
  ) || [];

  // Detail view histories count
  const detailHistories = useLiveQuery(
    async () => {
      if (!viewingNote) return [];
      return await db.histories.where('noteId').equals(viewingNote.id).toArray();
    },
    [viewingNote]
  ) || [];

  // ================= Project CRUD =================
  const handleCreateProject = async (name: string, color: string, description: string) => {
    const now = Date.now();
    const newProj: Project = {
      id: 'proj-' + Math.random().toString(36).substring(2, 9),
      name,
      color,
      description,
      createdAt: now,
      updatedAt: now,
    };
    await db.projects.add(newProj);
    selectProject(newProj.id);
  };

  const handleUpdateProject = async (id: string, name: string, color: string, description: string) => {
    await db.projects.update(id, {
      name,
      color,
      description,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteProject = async (id: string) => {
    const now = Date.now();
    const project = await db.projects.get(id);
    if (!project) return;

    // 软删除：项目与其下所有便签都写入墓碑，删除动作才能通过同步传播到其他设备
    const notesInProj = await db.notes.where('projectId').equals(id).toArray();
    const liveNotes = notesInProj.filter((n) => !n.deletedAt);
    if (liveNotes.length > 0) {
      await db.notes.bulkPut(liveNotes.map((n) => ({ ...n, deletedAt: now, updatedAt: now })));
      for (const n of liveNotes) {
        deleteNoteFromExternalVault(n.title, project.name).catch(() => {});
      }
    }

    await db.projects.put({ ...project, deletedAt: now, updatedAt: now });

    const remaining = projects.filter((p) => p.id !== id);
    if (remaining.length > 0) {
      selectProject(remaining[0].id);
    }
  };

  // ================= Note CRUD & Git Snapshots =================
  const handleOpenCreateNote = () => {
    setEditingNote(null);
    setIsEditorOpen(true);
  };

  const handleOpenEditNote = (note: Note) => {
    if (!note) return;
    setIsDetailOpen(false);
    setViewingNote(null);
    setEditingNote(note);
    setIsEditorOpen(true);
  };

  // Import local .md / .markdown / .txt file into current project
  const handleImportMarkdown = async () => {
    const res = await importMarkdownFile();
    if (!res.success || res.cancelled || typeof res.content !== 'string') {
      return;
    }

    const parsed = parseImportedMarkdown(res.filename || '导入便签.md', res.content);
    await handleSaveNote(
      {
        projectId: activeProjectId,
        title: parsed.title,
        content: parsed.content,
        images: parsed.images,
        pinned: false,
      },
      `📥 从文件导入「${res.filename || parsed.title}」`
    );
  };

  const handleSaveNote = async (noteData: Partial<Note>, commitMessage: string) => {
    const now = Date.now();
    let savedNote: Note | null = null;

    if (noteData.id) {
      // Update existing note
      const existing = await db.notes.get(noteData.id);
      if (!existing) return;

      const updatedNote: Note = {
        ...existing,
        projectId: noteData.projectId || existing.projectId,
        title: noteData.title || existing.title,
        content: noteData.content ?? existing.content,
        pinned: noteData.pinned ?? existing.pinned,
        images: noteData.images ?? existing.images,
        updatedAt: now,
      };

      await db.notes.put(updatedNote);
      savedNote = updatedNote;

      // Create a new Git-like History Snapshot
      const prevHistories = await db.histories.where('noteId').equals(existing.id).toArray();
      const nextVersion = prevHistories.length > 0
        ? Math.max(...prevHistories.map((h) => h.version)) + 1
        : 1;

      const newHistory: NoteHistory = {
        id: 'hist-' + Math.random().toString(36).substring(2, 9),
        noteId: existing.id,
        version: nextVersion,
        commitMessage: commitMessage || '更新便签内容',
        title: updatedNote.title,
        content: updatedNote.content,
        timestamp: now,
        charCount: updatedNote.content.length,
      };

      await db.histories.add(newHistory);

      // If this note is open in detail view, update state
      if (viewingNote?.id === existing.id) {
        setViewingNote(updatedNote);
      }
    } else {
      // Create new note
      const newId = 'note-' + Math.random().toString(36).substring(2, 9);
      const newNote: Note = {
        id: newId,
        projectId: noteData.projectId || activeProjectId,
        title: noteData.title || '无标题便签',
        content: noteData.content || '',
        pinned: noteData.pinned || false,
        images: noteData.images || [],
        tags: [],
        createdAt: now,
        updatedAt: now,
      };

      await db.notes.add(newNote);
      savedNote = newNote;

      // Create Initial Version Snapshot (v1)
      const initialHistory: NoteHistory = {
        id: 'hist-' + Math.random().toString(36).substring(2, 9),
        noteId: newId,
        version: 1,
        commitMessage: commitMessage || '初始创建便签',
        title: newNote.title,
        content: newNote.content,
        timestamp: now,
        charCount: newNote.content.length,
      };

      await db.histories.add(initialHistory);
    }

    // Mirror to external storage vault asynchronously
    if (savedNote) {
      const proj = projects.find((p) => p.id === savedNote!.projectId);
      writeNoteToExternalVault(savedNote, proj).catch(() => {});
    }
  };

  const handleDeleteNote = async (id: string) => {
    const existing = await db.notes.get(id);
    if (!existing || existing.deletedAt) return;

    const now = Date.now();
    // 软删除：保留一条墓碑记录（含删除时间），其他设备同步时据此删除同一便签
    await db.notes.put({ ...existing, deletedAt: now, updatedAt: now });

    const proj = projects.find((p) => p.id === existing.projectId);
    deleteNoteFromExternalVault(existing.title, proj?.name || '默认项目').catch(() => {});

    if (viewingNote?.id === id) {
      setIsDetailOpen(false);
      setViewingNote(null);
    }
  };

  const handleTogglePin = async (note: Note) => {
    await db.notes.update(note.id, { pinned: !note.pinned });
    if (viewingNote?.id === note.id) {
      setViewingNote({ ...note, pinned: !note.pinned });
    }
  };

  // Duplicate note along with all of its Git revision history
  const handleDuplicateNote = async (note: Note) => {
    const now = Date.now();
    const newId = 'note-' + Math.random().toString(36).substring(2, 9);
    const duplicatedNote: Note = {
      ...note,
      id: newId,
      title: `${note.title || '无标题便签'} (副本)`,
      images: note.images ? [...note.images] : [],
      tags: note.tags ? [...note.tags] : [],
      createdAt: now,
      updatedAt: now,
    };

    await db.notes.add(duplicatedNote);

    // Clone all Git history records from the source note
    const origHistories = await db.histories.where('noteId').equals(note.id).toArray();
    if (origHistories.length > 0) {
      const sorted = [...origHistories].sort((a, b) => a.version - b.version);
      const copiedHistories: NoteHistory[] = sorted.map((h) => ({
        ...h,
        id: 'hist-' + Math.random().toString(36).substring(2, 9),
        noteId: newId,
      }));
      await db.histories.bulkAdd(copiedHistories);
    } else {
      await db.histories.add({
        id: 'hist-' + Math.random().toString(36).substring(2, 9),
        noteId: newId,
        version: 1,
        commitMessage: '复制便签初始版本',
        title: duplicatedNote.title,
        content: duplicatedNote.content,
        timestamp: now,
        charCount: duplicatedNote.content.length,
      });
    }
  };

  // Restore directly to a previous version (Git hard reset: revert state & remove newer commits without adding a new commit)
  const handleRestoreVersion = async (history: NoteHistory) => {
    const now = Date.now();
    const existing = await db.notes.get(history.noteId);
    if (!existing) return;

    const restoredNote: Note = {
      ...existing,
      title: history.title,
      content: history.content,
      updatedAt: now,
    };

    await db.notes.put(restoredNote);

    // Delete any commits newer than the target version (direct rollback, do NOT add an extra commit on top)
    const allNoteHistories = await db.histories.where('noteId').equals(existing.id).toArray();
    const newerHistoryIds = allNoteHistories
      .filter((h) => h.version > history.version)
      .map((h) => h.id);

    if (newerHistoryIds.length > 0) {
      await db.histories.bulkDelete(newerHistoryIds);
    }

    if (viewingNote?.id === existing.id) {
      setViewingNote(restoredNote);
    }
    if (gitDiffNote?.id === existing.id) {
      setGitDiffNote(restoredNote);
    }
  };

  // Navigate to another note when clicking reference links
  const handleNavigateToNote = (noteId: string) => {
    const target = allNotes.find((n) => n.id === noteId);
    if (target) {
      setActiveProjectId(target.projectId);
      setViewingNote(target);
      setIsDetailOpen(true);
    } else {
      alert('未找到被引用的便签，该便签可能已被删除。');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex flex-col font-sans transition-colors">
      {/* Top Header with Project Name & Quick Actions */}
      <Header
        currentProject={activeProject}
        onOpenProjectDrawer={() => setIsProjectDrawerOpen(true)}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        onOpenSyncVaultModal={() => setIsSyncVaultOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSearch={showSearch}
        onToggleSearch={() => {
          setShowSearch(!showSearch);
          if (showSearch) setSearchQuery('');
        }}
        isProjectDrawerOpen={isProjectDrawerOpen}
        isGlobalSearch={isGlobalSearch}
        onToggleGlobalSearch={() => setIsGlobalSearch(!isGlobalSearch)}
      />

      {/* Main Container */}
      <main
        className="flex-1 max-w-4xl w-full mx-auto px-4 py-5"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6.5rem)',
        }}
      >
        {/* Project Subheader Info - Refactoring UI Hierarchy */}
        <div className="flex items-center justify-between mb-3.5 px-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full ring-2 ring-white dark:ring-zinc-900 shadow-2xs shrink-0 transition-colors"
              style={{ backgroundColor: isGlobalSearch ? 'var(--theme-primary)' : (activeProject?.color || 'var(--theme-primary)') }}
            />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-zinc-200 truncate">
              {isGlobalSearch && searchQuery ? '全局搜索' : (activeProject?.name || '便签列表')}
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 font-mono font-medium shrink-0">
              {currentNotes.length}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {searchQuery && (
              <span className="text-[11px] text-theme font-medium animate-fadeIn hidden sm:inline">
                匹配「{searchQuery}」
              </span>
            )}
            <button
              onClick={handleImportMarkdown}
              className="touch-press flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 hover:bg-slate-200/70 dark:bg-zinc-800/90 dark:hover:bg-zinc-700/70 text-slate-700 dark:text-zinc-300 text-xs font-medium transition-all border border-slate-200/60 dark:border-zinc-700/60 shadow-2xs"
              title="从本地导入 Markdown (.md) 文件"
            >
              <FileUp className="w-3.5 h-3.5 text-theme" />
              <span>导入 .md</span>
            </button>
          </div>
        </div>

        {/* Notes Grid / Flow with transition key */}
        {currentNotes.length === 0 ? (
          <div className="my-10 max-w-sm mx-auto p-8 rounded-3xl bg-white/60 dark:bg-zinc-900/40 border border-dashed border-slate-200 dark:border-zinc-800/80 flex flex-col items-center justify-center text-center animate-fade-scale shadow-2xs">
            <div className="w-14 h-14 rounded-2xl bg-theme/10 text-theme flex items-center justify-center mb-3.5 shadow-inner">
              <StickyNote className="w-7 h-7 stroke-[1.75]" />
            </div>
            <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-zinc-200 mb-1">
              {searchQuery ? '未找到匹配便签' : '当前项目暂无便签'}
            </h3>
            <p className="text-xs text-slate-400 dark:text-zinc-500 max-w-xs mb-5 leading-relaxed">
              {searchQuery
                ? '建议检查拼写或切换至全局搜索查看其他项目。'
                : '开始记录当前项目灵感，或直接从本地导入已有 Markdown 笔记。'}
            </p>
            {!searchQuery && (
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  onClick={handleOpenCreateNote}
                  className="touch-press flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-theme text-white text-xs font-semibold hover:brightness-95 shadow-sm shadow-theme/20 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  新建便签
                </button>
                <button
                  onClick={handleImportMarkdown}
                  className="touch-press flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs font-medium hover:bg-slate-200 dark:hover:bg-zinc-700 border border-slate-200/80 dark:border-zinc-700/80 flex items-center justify-center gap-1.5 transition-all"
                >
                  <FileUp className="w-3.5 h-3.5 text-theme" />
                  导入 .md
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            key={(isGlobalSearch ? 'global' : activeProjectId) + (searchQuery ? '-q' : '')}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 animate-fade-scale"
          >
            {currentNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                project={isGlobalSearch ? projects.find((p) => p.id === note.projectId) : undefined}
                onClick={() => {
                  setViewingNote(note);
                  setIsDetailOpen(true);
                }}
                onEdit={(e) => {
                  e.stopPropagation();
                  handleOpenEditNote(note);
                }}
                onDuplicate={(e) => {
                  e.stopPropagation();
                  handleDuplicateNote(note);
                }}
                onDelete={(e) => {
                  e.stopPropagation();
                  if (confirm(`确定要删除便签「${note.title}」吗？`)) {
                    handleDeleteNote(note.id);
                  }
                }}
                onTogglePin={(e) => {
                  e.stopPropagation();
                  handleTogglePin(note);
                }}
                onOpenGitDiff={(e) => {
                  e.stopPropagation();
                  setGitDiffNote(note);
                  setIsGitDiffOpen(true);
                }}
                onOpenExport={(e) => {
                  e.stopPropagation();
                  setExportingNote(note);
                  setIsExportOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating Action Button (FAB) - Refactoring UI Tactile Glow & Elevation */}
      <div
        className="fixed right-5 sm:right-6 z-30 pointer-events-none"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
        }}
      >
        <button
          onClick={handleOpenCreateNote}
          className="touch-press pointer-events-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-theme text-white shadow-xl shadow-theme/35 hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center group ring-4 ring-white/20 dark:ring-zinc-900/20"
          title="新建便签"
        >
          <Plus className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5] transition-transform duration-200 group-hover:rotate-90" />
        </button>
      </div>

      {/* Project Switcher Drawer */}
      <ProjectDrawer
        isOpen={isProjectDrawerOpen}
        onClose={() => setIsProjectDrawerOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={selectProject}
        onCreateProject={handleCreateProject}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        projectNoteCounts={projectNoteCounts}
      />

      {/* Note Editor Modal */}
      {isEditorOpen && (
        <NoteEditor
          key={editingNote ? `edit-${editingNote.id}-${editingNote.updatedAt}` : 'create-new'}
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingNote(null);
          }}
          note={editingNote}
          activeProjectId={activeProjectId}
          projects={projects}
          allNotes={allNotes}
          onSave={handleSaveNote}
        />
      )}

      {/* Note Detail Modal */}
      <NoteDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setViewingNote(null);
        }}
        note={viewingNote}
        project={projects.find((p) => p.id === viewingNote?.projectId)}
        allNotes={allNotes}
        projects={projects}
        histories={detailHistories}
        onEdit={(n) => handleOpenEditNote(n)}
        onDuplicate={(n) => {
          handleDuplicateNote(n);
          setIsDetailOpen(false);
          setViewingNote(null);
        }}
        onDelete={(id) => handleDeleteNote(id)}
        onTogglePin={(n) => handleTogglePin(n)}
        onOpenGitDiff={(n) => {
          setGitDiffNote(n);
          setIsGitDiffOpen(true);
        }}
        onOpenExport={(n) => {
          setExportingNote(n);
          setIsExportOpen(true);
        }}
        onNavigateToNote={handleNavigateToNote}
      />

      {/* Git Diff & Revision History Modal */}
      {gitDiffNote && (
        <GitDiffModal
          isOpen={isGitDiffOpen}
          onClose={() => {
            setIsGitDiffOpen(false);
            setGitDiffNote(null);
          }}
          note={gitDiffNote}
          histories={diffHistories}
          onRestoreVersion={handleRestoreVersion}
        />
      )}

      {/* Export & Share Modal */}
      {exportingNote && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => {
            setIsExportOpen(false);
            setExportingNote(null);
          }}
          note={exportingNote}
          project={projects.find((p) => p.id === exportingNote.projectId)}
        />
      )}

      {/* Theme & Custom Colors Modal */}
      <ThemeModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />

      {/* LAN Sync & External Storage Vault Modal */}
      <SyncVaultModal
        isOpen={isSyncVaultOpen}
        onClose={() => setIsSyncVaultOpen(false)}
        projects={projects}
        notes={allNotes}
        onDataChanged={() => {}}
        onOpenReport={(res) => setActiveSyncReport(res)}
      />

      {/* Sync Confirmation Modal (Bidirectional explicit security confirmation) */}
      <SyncConfirmationModal
        request={incomingSyncRequest}
        onAccept={handleAcceptSync}
        onReject={handleRejectSync}
        localNoteCount={allNotes.length}
        localProjectCount={projects.length}
      />

      {/* Standalone Comprehensive Sync Report Modal */}
      <SyncReportModal
        isOpen={Boolean(activeSyncReport)}
        onClose={() => setActiveSyncReport(null)}
        result={activeSyncReport}
      />
    </div>
  );
};
