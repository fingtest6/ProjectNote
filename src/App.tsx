import React, { useMemo, useState } from 'react';
import { Plus, StickyNote, FileUp } from 'lucide-react';
import type { Note, NoteHistory } from './types';
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
import { useNotesStore, useNoteHistories } from './hooks/useNotesStore';
import { useSyncSession } from './hooks/useSyncSession';

export const App: React.FC = () => {
  const {
    projects,
    allNotes,
    activeProjectId,
    activeProject,
    projectNoteCounts,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    saveNote,
    deleteNote,
    togglePin,
    duplicateNote,
    restoreVersion,
    importMarkdown,
  } = useNotesStore();

  const {
    incomingSyncRequest,
    activeSyncReport,
    acceptSync,
    rejectSync,
    setActiveSyncReport,
  } = useSyncSession();

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
        if (incomingSyncRequest) rejectSync(incomingSyncRequest);
      },
    },
  ]);

  // Histories for Git Diff modal / detail view
  const diffHistories = useNoteHistories(gitDiffNote?.id);
  const detailHistories = useNoteHistories(viewingNote?.id);

  // ================= Project actions（数据逻辑在 useNotesStore） =================
  const handleCreateProject = async (name: string, color: string, description: string) => {
    await createProject(name, color, description);
  };

  const handleUpdateProject = (id: string, name: string, color: string, description: string) =>
    updateProject(id, name, color, description);

  const handleDeleteProject = (id: string) => deleteProject(id);

  // ================= Note actions（数据逻辑在 useNotesStore） =================
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

  const handleImportMarkdown = async () => {
    await importMarkdown();
  };

  const handleSaveNote = async (noteData: Partial<Note>, commitMessage: string) => {
    const saved = await saveNote(noteData, commitMessage);
    if (saved && viewingNote?.id === saved.id) {
      setViewingNote(saved);
    }
  };

  const handleDeleteNote = async (id: string) => {
    const deleted = await deleteNote(id);
    if (deleted && viewingNote?.id === id) {
      setIsDetailOpen(false);
      setViewingNote(null);
    }
  };

  const handleTogglePin = async (note: Note) => {
    const updated = await togglePin(note);
    if (viewingNote?.id === note.id) {
      setViewingNote(updated);
    }
  };

  const handleDuplicateNote = (note: Note) => duplicateNote(note);

  const handleRestoreVersion = async (history: NoteHistory) => {
    const restored = await restoreVersion(history);
    if (!restored) return;
    if (viewingNote?.id === restored.id) setViewingNote(restored);
    if (gitDiffNote?.id === restored.id) setGitDiffNote(restored);
  };

  // Navigate to another note when clicking reference links
  const handleNavigateToNote = (noteId: string) => {
    const target = allNotes.find((n) => n.id === noteId);
    if (target) {
      selectProject(target.projectId);
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
        onAccept={acceptSync}
        onReject={rejectSync}
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
