import React, { useState } from 'react';
import { X, Plus, Check, Trash2, Edit2, Layers } from 'lucide-react';
import type { Project } from '../types';

interface ProjectDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (name: string, color: string, description: string) => Promise<void>;
  onUpdateProject: (id: string, name: string, color: string, description: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  projectNoteCounts: Record<string, number>;
}

const PRESET_COLORS = [
  '#10b981', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f97316', // orange
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#64748b', // slate
];

export const ProjectDrawer: React.FC<ProjectDrawerProps> = ({
  isOpen,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  projectNoteCounts,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#10b981');
  const [formDesc, setFormDesc] = useState('');

  if (!isOpen) return null;

  const startCreate = () => {
    setFormName('');
    setFormColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
    setFormDesc('');
    setEditingProject(null);
    setIsCreating(true);
  };

  const startEdit = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    setFormName(p.name);
    setFormColor(p.color || '#10b981');
    setFormDesc(p.description || '');
    setEditingProject(p);
    setIsCreating(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingProject) {
      await onUpdateProject(editingProject.id, formName.trim(), formColor, formDesc.trim());
    } else {
      await onCreateProject(formName.trim(), formColor, formDesc.trim());
    }
    setIsCreating(false);
    setEditingProject(null);
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (projects.length <= 1) {
      alert('至少需要保留一个项目！');
      return;
    }
    const count = projectNoteCounts[id] || 0;
    if (confirm(`确定要删除项目「${name}」吗？${count > 0 ? `该项目下的 ${count} 条便签也将被同步删除！` : ''}`)) {
      await onDeleteProject(id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity animate-fade-scale"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200/80 dark:border-zinc-800 animate-slide-up-spring"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Indicator Handle */}
        <div className="pt-2.5 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-zinc-700 opacity-70" />
        </div>

        {/* Drawer Header */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-theme" />
            <h2 className="font-semibold text-base text-slate-800 dark:text-zinc-100">
              {isCreating ? (editingProject ? '编辑项目' : '新建项目') : '切换项目空间'}
            </h2>
          </div>
          <button
            onClick={() => {
              if (isCreating) {
                setIsCreating(false);
                setEditingProject(null);
              } else {
                onClose();
              }
            }}
            className="touch-press w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1">
          {isCreating ? (
            /* Create / Edit Form */
            <form onSubmit={handleSaveForm} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1.5">
                  项目名称 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：工作备忘、考研复习、旅游攻略..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-theme/40 text-sm text-slate-900 dark:text-zinc-100"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1.5">
                  项目主题色
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`touch-press w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                        formColor === c
                          ? 'scale-110 ring-2 ring-offset-2 ring-slate-400 dark:ring-zinc-600 shadow-sm'
                          : 'opacity-85 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {formColor === c && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </button>
                  ))}
                  <input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-0"
                    title="选择任意颜色"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1.5">
                  项目描述（可选）
                </label>
                <textarea
                  rows={2}
                  placeholder="简单记录此项目的分类目的..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-theme/40 text-sm text-slate-900 dark:text-zinc-100 resize-none"
                />
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingProject(null);
                  }}
                  className="touch-press flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="touch-press flex-1 py-2.5 rounded-xl bg-theme text-white text-xs font-medium hover:brightness-95 shadow-sm active:scale-98 transition-all"
                >
                  {editingProject ? '保存修改' : '确认创建'}
                </button>
              </div>
            </form>
          ) : (
            /* Projects List */
            <div className="space-y-2">
              {projects.map((p) => {
                const isSelected = p.id === activeProjectId;
                const count = projectNoteCounts[p.id] || 0;

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id);
                      onClose();
                    }}
                    className={`touch-press flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-all ${
                      isSelected
                        ? 'border-theme/60 bg-theme/5 dark:bg-theme/10 shadow-xs ring-1 ring-theme/20'
                        : 'border-slate-200/60 dark:border-zinc-800 hover:bg-slate-50/80 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow-xs ring-2 ring-white dark:ring-zinc-900"
                        style={{ backgroundColor: p.color || '#10b981' }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm text-slate-800 dark:text-zinc-100 truncate">
                            {p.name}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-theme text-white">
                              当前
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-xs text-slate-400 dark:text-zinc-500 truncate mt-0.5">
                            {p.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                        {count} 篇
                      </span>
                      <button
                        onClick={(e) => startEdit(e, p)}
                        className="touch-press-subtle w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-700/60"
                        title="编辑项目"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {projects.length > 1 && (
                        <button
                          onClick={(e) => handleDelete(e, p.id, p.name)}
                          className="touch-press-subtle w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          title="删除项目"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add New Project Button */}
              <button
                onClick={startCreate}
                className="touch-press w-full mt-2 py-3 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 hover:border-theme hover:bg-theme/5 flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:text-theme transition-all"
              >
                <Plus className="w-4 h-4" />
                新建项目空间
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
