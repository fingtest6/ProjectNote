import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initSeedData, purgeExpiredTombstones } from '../db';
import type { Note, NoteHistory, Project } from '../types';
import { deleteNoteFromExternalVault, writeNoteToExternalVault } from '../utils/vaultStorage';
import { importMarkdownFile, parseImportedMarkdown } from '../utils/exporter';

const STORAGE_KEY_ACTIVE_PROJECT = 'project_notes_saved_project_id';

/**
 * 便签与项目的本地数据层：
 * - 响应式数据（只暴露未删除项，墓碑仅用于同步）
 * - 当前项目选择与持久化
 * - 项目 / 便签 CRUD、版本快照、外部镜像
 *
 * 这里不持有任何弹窗、搜索等纯界面状态，便于单独复用与测试。
 */
export function useNotesStore() {
  // 首次挂载：写入种子数据并回收过期墓碑
  useEffect(() => {
    (async () => {
      await initSeedData();
      await purgeExpiredTombstones();
    })().catch((err) => console.error('初始化本地数据库失败:', err));
  }, []);

  // 只把「未删除」的数据暴露给界面
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deletedAt).toArray()) || [];
  const allNotes = useLiveQuery(() => db.notes.filter((n) => !n.deletedAt).toArray()) || [];

  // ================= 当前项目 =================
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT) || '';
  });

  const selectProject = useCallback((id: string) => {
    setActiveProjectId(id);
    localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, id);
  }, []);

  // 项目加载后校正当前项目（保存的项目被删除/不存在时回退到默认项目）
  useEffect(() => {
    if (projects.length === 0) return;

    const savedId = localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT);
    const isSavedValid = savedId && projects.some((p) => p.id === savedId);

    if (isSavedValid) {
      if (activeProjectId !== savedId) {
        setActiveProjectId(savedId);
      }
      return;
    }

    if (!projects.some((p) => p.id === activeProjectId)) {
      const defaultProj = projects.find((p) => p.isDefault) || projects[0];
      setActiveProjectId(defaultProj.id);
      localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, defaultProj.id);
    }
  }, [projects, activeProjectId]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || null,
    [projects, activeProjectId]
  );

  const projectNoteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allNotes.forEach((n) => {
      counts[n.projectId] = (counts[n.projectId] || 0) + 1;
    });
    return counts;
  }, [allNotes]);

  // ================= 项目 CRUD =================
  const createProject = useCallback(
    async (name: string, color: string, description: string) => {
      const now = Date.now();
      const newProject: Project = {
        id: 'proj-' + Math.random().toString(36).substring(2, 9),
        name,
        color,
        description,
        createdAt: now,
        updatedAt: now,
      };
      await db.projects.add(newProject);
      selectProject(newProject.id);
      return newProject;
    },
    [selectProject]
  );

  const updateProject = useCallback(async (id: string, name: string, color: string, description: string) => {
    await db.projects.update(id, {
      name,
      color,
      description,
      updatedAt: Date.now(),
    });
  }, []);

  const deleteProject = useCallback(
    async (id: string) => {
      const now = Date.now();
      const project = await db.projects.get(id);
      if (!project) return;

      // 软删除：项目与其下所有便签都写入墓碑，删除动作才能通过同步传播到其他设备
      const notesInProject = await db.notes.where('projectId').equals(id).toArray();
      const liveNotes = notesInProject.filter((n) => !n.deletedAt);
      if (liveNotes.length > 0) {
        await db.notes.bulkPut(liveNotes.map((n) => ({ ...n, deletedAt: now, updatedAt: now })));
        for (const note of liveNotes) {
          deleteNoteFromExternalVault(note.title, project.name).catch(() => {});
        }
      }

      await db.projects.put({ ...project, deletedAt: now, updatedAt: now });

      if (activeProjectId === id) {
        const remaining = projects.filter((p) => p.id !== id);
        if (remaining.length > 0) {
          selectProject(remaining[0].id);
        }
      }
    },
    [projects, activeProjectId, selectProject]
  );

  // ================= 便签 CRUD 与版本快照 =================
  const saveNote = useCallback(
    async (noteData: Partial<Note>, commitMessage: string): Promise<Note | null> => {
      const now = Date.now();
      let savedNote: Note | null = null;

      if (noteData.id) {
        const existing = await db.notes.get(noteData.id);
        if (!existing) return null;

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

        // 每次保存生成一条 Git 风格历史快照
        const prevHistories = await db.histories.where('noteId').equals(existing.id).toArray();
        const nextVersion =
          prevHistories.length > 0 ? Math.max(...prevHistories.map((h) => h.version)) + 1 : 1;

        await db.histories.add({
          id: 'hist-' + Math.random().toString(36).substring(2, 9),
          noteId: existing.id,
          version: nextVersion,
          commitMessage: commitMessage || '更新便签内容',
          title: updatedNote.title,
          content: updatedNote.content,
          timestamp: now,
          charCount: updatedNote.content.length,
        });
      } else {
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

        await db.histories.add({
          id: 'hist-' + Math.random().toString(36).substring(2, 9),
          noteId: newId,
          version: 1,
          commitMessage: commitMessage || '初始创建便签',
          title: newNote.title,
          content: newNote.content,
          timestamp: now,
          charCount: newNote.content.length,
        });
      }

      if (savedNote) {
        const project = projects.find((p) => p.id === savedNote!.projectId);
        writeNoteToExternalVault(savedNote, project).catch(() => {});
      }

      return savedNote;
    },
    [activeProjectId, projects]
  );

  const deleteNote = useCallback(
    async (id: string): Promise<boolean> => {
      const existing = await db.notes.get(id);
      if (!existing || existing.deletedAt) return false;

      const now = Date.now();
      // 软删除：保留墓碑（含删除时间），其他设备同步时据此删除同一便签
      await db.notes.put({ ...existing, deletedAt: now, updatedAt: now });

      const project = projects.find((p) => p.id === existing.projectId);
      deleteNoteFromExternalVault(existing.title, project?.name || '默认项目').catch(() => {});

      return true;
    },
    [projects]
  );

  const togglePin = useCallback(async (note: Note): Promise<Note> => {
    const updated = { ...note, pinned: !note.pinned };
    await db.notes.update(note.id, { pinned: updated.pinned });
    return updated;
  }, []);

  // 复制便签及其全部历史版本
  const duplicateNote = useCallback(async (note: Note) => {
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

    const originalHistories = await db.histories.where('noteId').equals(note.id).toArray();
    if (originalHistories.length > 0) {
      const sorted = [...originalHistories].sort((a, b) => a.version - b.version);
      await db.histories.bulkAdd(
        sorted.map((history) => ({
          ...history,
          id: 'hist-' + Math.random().toString(36).substring(2, 9),
          noteId: newId,
        }))
      );
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

    return duplicatedNote;
  }, []);

  // 回退到指定历史版本（Git hard reset：直接回退并删除更新的提交）
  const restoreVersion = useCallback(async (history: NoteHistory): Promise<Note | null> => {
    const now = Date.now();
    const existing = await db.notes.get(history.noteId);
    if (!existing) return null;

    const restoredNote: Note = {
      ...existing,
      title: history.title,
      content: history.content,
      updatedAt: now,
    };

    await db.notes.put(restoredNote);

    const allHistories = await db.histories.where('noteId').equals(existing.id).toArray();
    const newerHistoryIds = allHistories
      .filter((h) => h.version > history.version)
      .map((h) => h.id);

    if (newerHistoryIds.length > 0) {
      await db.histories.bulkDelete(newerHistoryIds);
    }

    return restoredNote;
  }, []);

  // 从本地 Markdown 文件导入为新便签
  const importMarkdown = useCallback(async (): Promise<Note | null> => {
    const result = await importMarkdownFile();
    if (!result.success || result.cancelled || typeof result.content !== 'string') {
      return null;
    }

    const parsed = parseImportedMarkdown(result.filename || '导入便签.md', result.content);
    return saveNote(
      {
        projectId: activeProjectId,
        title: parsed.title,
        content: parsed.content,
        images: parsed.images,
        pinned: false,
      },
      `📥 从文件导入「${result.filename || parsed.title}」`
    );
  }, [activeProjectId, saveNote]);

  return {
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
  };
}

/** 某篇便签的全部历史版本（响应式） */
export function useNoteHistories(noteId: string | null | undefined) {
  return (
    useLiveQuery(async () => {
      if (!noteId) return [];
      return db.histories.where('noteId').equals(noteId).toArray();
    }, [noteId]) || []
  );
}
