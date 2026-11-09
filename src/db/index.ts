import Dexie, { type Table } from 'dexie';
import type { Project, Note, NoteHistory } from '../types';

export class NotesDatabase extends Dexie {
  projects!: Table<Project, string>;
  notes!: Table<Note, string>;
  histories!: Table<NoteHistory, string>;

  constructor() {
    super('ProjectNotesAppDB');
    this.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      notes: 'id, projectId, pinned, createdAt, updatedAt, *tags',
      histories: 'id, noteId, version, timestamp'
    });
  }
}

export const db = new NotesDatabase();

// 墓碑（软删除记录）在多端之间保留 30 天，用于把「删除」传播给长时间离线的设备；
// 超过保留期后连同其历史版本一起物理清理，避免数据库无限膨胀。
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function purgeExpiredTombstones() {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;

  const expiredNotes = await db.notes
    .filter((note) => Boolean(note.deletedAt) && (note.deletedAt as number) < cutoff)
    .toArray();

  for (const note of expiredNotes) {
    await db.histories.where('noteId').equals(note.id).delete();
    await db.notes.delete(note.id);
  }

  const expiredProjects = await db.projects
    .filter((project) => Boolean(project.deletedAt) && (project.deletedAt as number) < cutoff)
    .toArray();

  if (expiredProjects.length > 0) {
    await db.projects.bulkDelete(expiredProjects.map((project) => project.id));
  }
}

export async function initSeedData() {
  const projectCount = await db.projects.count();
  if (projectCount > 0) return;

  const now = Date.now();

  // 1. Initial Projects
  const project1: Project = {
    id: 'proj-starter',
    name: '🚀 欢迎与快速上手',
    color: '#10b981',
    description: '功能介绍与操作指南',
    createdAt: now - 3600 * 1000 * 24,
    updatedAt: now - 3600 * 1000 * 24,
    isDefault: true,
  };

  const project2: Project = {
    id: 'proj-work',
    name: '💼 移动端架构设计',
    color: '#3b82f6',
    description: '系统架构、原型与技术规划',
    createdAt: now - 3600 * 1000 * 12,
    updatedAt: now - 3600 * 1000 * 12,
  };

  const project3: Project = {
    id: 'proj-ideas',
    name: '💡 创意与灵感随笔',
    color: '#f59e0b',
    description: '随时捕获的灵感火花',
    createdAt: now - 3600 * 1000 * 6,
    updatedAt: now - 3600 * 1000 * 6,
  };

  await db.projects.bulkAdd([project1, project2, project3]);

  // 2. Initial Notes
  const note1Id = 'note-welcome';
  const note2Id = 'note-cross-ref-demo';
  const note3Id = 'note-arch';

  const note1: Note = {
    id: note1Id,
    projectId: project1.id,
    title: '✨ 欢迎使用项目便签应用',
    content: `# 项目便签操作指南

欢迎使用专为**项目管理**与**深度记录**打造的便签应用！

### 核心特性演示：
1. **顶部项目切换**：点击顶部导航栏中的项目名，随时快速切换不同项目空间。
2. **记录交叉引用**：可以在正文输入 \`[[\` 或点击工具栏 🔗 引用其他便签，例如：
   👉 关联参考：[[${note2Id}|双链交叉引用测试便签]]
3. **Git 式修改历史**：点击右上角 🕒 历史图标，随时查看像 Git 一样的代码/文本提交差异（Diff），红绿清晰对比！
4. **Markdown 渲染与待办**：
   - [x] 支持待办清单勾选
   - [x] 支持富文本、标题、代码块
   - [ ] 支持点击导出为 Markdown 与高清长图
5. **主题与暗黑模式**：点击右上角调色盘 🎨 可自由设定你喜爱的主题色或纯黑夜间模式。`,
    images: [],
    pinned: true,
    tags: ['指南', '特性'],
    createdAt: now - 3600 * 1000 * 20,
    updatedAt: now - 3600 * 1000 * 2,
  };

  const note2: Note = {
    id: note2Id,
    projectId: project1.id,
    title: '🔗 双链交叉引用测试便签',
    content: `这是被 [[${note1Id}|欢迎使用项目便签应用]] 引用的便签。

点击下方的“反向链接 (Backlinks)”或者从上方便签点击胶囊，即可互相跳转，非常适合：
- 需求与设计稿对应
- 灵感与任务关联
- 跨项目笔记互相借用

> 无论便签属于哪个项目，均支持全局跨项目引用！`,
    images: [],
    pinned: false,
    tags: ['引用', '测试'],
    createdAt: now - 3600 * 1000 * 18,
    updatedAt: now - 3600 * 1000 * 18,
  };

  const note3: Note = {
    id: note3Id,
    projectId: project2.id,
    title: '📱 安卓端技术架构方案',
    content: `## 技术选型总览

- **前端技术栈**: React 18 + Tailwind CSS + Dexie.js (IndexedDB)
- **移动打包方案**: Capacitor Android 原生容器
- **核心组件**:
  1. \`Header\`: 顶部下拉选择器快速切换项目
  2. \`MarkdownRenderer\`: 支持 GFM、待办框与 \`[[...]]\` 交叉链接
  3. \`GitDiffViewer\`: 类似 Git diff 的红绿行差异比对与一键版本回退

\`\`\`bash
# 打包为安卓 APK
npx cap add android
npx cap copy
npx cap open android
\`\`\``,
    images: [],
    pinned: true,
    tags: ['架构', 'Android'],
    createdAt: now - 3600 * 1000 * 10,
    updatedAt: now - 3600 * 1000 * 10,
  };

  await db.notes.bulkAdd([note1, note2, note3]);

  // 3. Seed Git history for note 1
  const historyV1: NoteHistory = {
    id: 'hist-1-v1',
    noteId: note1Id,
    version: 1,
    commitMessage: '初始创建便签',
    title: '欢迎使用项目便签应用',
    content: `# 项目便签操作指南\n\n欢迎使用专为项目管理与深度记录打造的便签应用！\n\n- [ ] 支持待办清单\n- [ ] 支持Markdown`,
    timestamp: now - 3600 * 1000 * 20,
    charCount: 75,
  };

  const historyV2: NoteHistory = {
    id: 'hist-1-v2',
    noteId: note1Id,
    version: 2,
    commitMessage: '补充核心特性与双链引用',
    title: '✨ 欢迎使用项目便签应用',
    content: note1.content,
    timestamp: now - 3600 * 1000 * 2,
    charCount: note1.content.length,
  };

  await db.histories.bulkAdd([historyV1, historyV2]);
}
