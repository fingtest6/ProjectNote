import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Smartphone,
  Laptop,
  Check,
  X,
  Sparkles,
  PlusCircle,
  ArrowUp,
  ArrowDown,
  Clock,
} from 'lucide-react';
import type { SyncMode, SyncConfirmationRequest } from '../types';

interface SyncConfirmationModalProps {
  request: SyncConfirmationRequest | null;
  onAccept: (req: SyncConfirmationRequest) => void;
  onReject: (req: SyncConfirmationRequest) => void;
  localNoteCount: number;
  localProjectCount: number;
}

const MODE_CONFIG: Record<
  SyncMode,
  { label: string; badge: string; desc: string; icon: React.ComponentType<{ className?: string }> }
> = {
  'smart-merge': {
    label: '双向智能合并',
    badge: '推荐 · 无损',
    desc: '双方各自新增互相保留；相同便签按最新时间自动合并，无缝融合历史版本。',
    icon: Sparkles,
  },
  'new-only': {
    label: '仅同步新增便签',
    badge: '安全 · 不覆盖',
    desc: '仅同步双方各自新创建的便签，双方已有的便签内容绝不改动。',
    icon: PlusCircle,
  },
  'push-overwrite': {
    label: '以对方版本完全覆盖本机',
    badge: '完全替换',
    desc: '对方数据作为唯一基准，本机所有便签和分类将被对方完全覆盖重置！',
    icon: ArrowDown,
  },
  'pull-overwrite': {
    label: '以本机版本完全覆盖对方',
    badge: '只读提供',
    desc: '对方请求拉取本机全部数据，本机数据保持不变，将完整克隆提供给对方。',
    icon: ArrowUp,
  },
};

export const SyncConfirmationModal: React.FC<SyncConfirmationModalProps> = ({
  request,
  onAccept,
  onReject,
  localNoteCount,
  localProjectCount,
}) => {
  const [countdown, setCountdown] = useState(40);
  const [submitting, setSubmitting] = useState(false);

  // 用 ref 保存最新回调，避免父组件每次渲染产生的新函数身份导致倒计时被反复重置
  const onRejectRef = useRef(onReject);
  onRejectRef.current = onReject;
  const requestRef = useRef(request);
  requestRef.current = request;
  const requestId = request?.id;

  // 每来一个新的同步请求，重置「正在提交」状态
  useEffect(() => {
    setSubmitting(false);
  }, [requestId]);

  useEffect(() => {
    if (requestId === undefined || requestId === null) return;
    // 用户已点击「允许」：立刻停止倒计时，避免合并过程中被自动拒绝，造成一边已写入、一边收到拒绝
    if (submitting) return;

    setCountdown(40);
    let remaining = 40;
    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        setCountdown(0);
        const current = requestRef.current;
        if (current) onRejectRef.current(current);
        return;
      }
      setCountdown(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [requestId, submitting]);

  if (!request) return null;

  const mode = request.mode || 'smart-merge';
  const modeInfo = MODE_CONFIG[mode] || MODE_CONFIG['smart-merge'];
  const ModeIcon = modeInfo.icon;
  const isMobile = request.from.deviceName.includes('手机') || request.from.deviceName.includes('Android') || request.from.deviceName.includes('iPhone');

  // 墓碑仍会随 payload 传输（LWW 需要），但展示给用户的「对方便签」只算未删除项，
  // 否则会出现「手机本机 1 篇，电脑却显示对方 3 篇」的口径不一致。
  const payloadNotes = request.payload?.notes;
  const payloadProjects = request.payload?.projects;
  const remoteNoteCount =
    payloadNotes && payloadNotes.length > 0
      ? payloadNotes.filter((n) => !n.deletedAt).length
      : request.summary?.noteCount ?? 0;
  const remoteProjectCount =
    payloadProjects && payloadProjects.length > 0
      ? payloadProjects.filter((p) => !p.deletedAt).length
      : request.summary?.projectCount ?? 0;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-scale">
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 flex flex-col animate-slide-up-spring"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-3 bg-amber-500/10 dark:bg-amber-500/15">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldAlert className="w-5 h-5 stroke-[2.3]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <span>收到局域网互联同步请求</span>
            </h3>
            <div className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 mt-0.5">
              <Clock className="w-3.5 h-3.5" />
              <span>请确认是否允许此设备与本机进行数据交换 ({countdown}s)</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Device Info Card */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-700/60 space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              请求发起设备
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-theme/10 text-theme flex items-center justify-center shrink-0">
                {isMobile ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">
                  {request.from.deviceName}
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  包含：{remoteNoteCount} 篇便签 · {remoteProjectCount} 个分类
                </div>
              </div>
            </div>
          </div>

          {/* Sync Mode Description */}
          <div className="p-3.5 rounded-2xl bg-theme/5 border border-theme/20 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-theme">
                <ModeIcon className="w-4 h-4" />
                <span>{modeInfo.label}</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-theme/15 text-theme">
                {modeInfo.badge}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
              {modeInfo.desc}
            </p>
          </div>

          {/* Local vs Remote Data Contrast */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-100/70 dark:bg-zinc-800/40 text-xs text-slate-600 dark:text-zinc-300 font-mono">
            <span>💻 本机当前便签：<b>{localNoteCount}</b> 篇 ({localProjectCount} 分类)</span>
            <span>📱 对方便签：<b>{remoteNoteCount}</b> 篇</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-zinc-800 flex gap-2.5 bg-slate-50/50 dark:bg-zinc-850/50">
          <button
            onClick={() => onReject(request)}
            disabled={submitting}
            className="touch-press flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4 text-rose-500" />
            <span>{submitting ? '同步处理中...' : `拒绝同步 (${countdown}s)`}</span>
          </button>

          <button
            onClick={() => {
              setSubmitting(true);
              onAccept(request);
            }}
            disabled={submitting}
            className="touch-press flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-98 transition-all disabled:opacity-60"
          >
            <Check className="w-4 h-4" />
            <span>{submitting ? '正在同步...' : '允许并立即同步'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
