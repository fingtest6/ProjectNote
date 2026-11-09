import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../db';
import type { SyncConfirmationRequest, SyncMode, SyncResult } from '../types';
import {
  generateLocalSyncPayload,
  getLastSyncTarget,
  handleServerIncomingSync,
  pollDeviceTask,
  syncWithRemoteServer,
} from '../utils/syncProtocol';

/**
 * 电脑端主动发起同步时，模式是以「电脑」为视角选择的；手机端真正执行时要换算成自己的视角：
 *  - 电脑端「以电脑为准覆盖手机」 == 手机端「拉取电脑数据并覆盖本机」
 *  - 电脑端「以手机为准覆盖电脑」 == 手机端「推送本机数据并覆盖电脑」
 */
export const translateInviteMode = (mode: SyncMode): SyncMode => {
  if (mode === 'push-overwrite') return 'pull-overwrite';
  if (mode === 'pull-overwrite') return 'push-overwrite';
  return mode;
};

/**
 * 局域网同步会话：
 * - 接收 Electron 主进程转来的同步确认请求，等待用户点击允许 / 拒绝
 * - 用户允许后合并数据并把本机完整数据回传给发起方
 * - 手机端在后台轮询电脑端下发的同步邀请
 * - 持有同步结果报告，供界面展示
 */
export function useSyncSession() {
  const [incomingSyncRequest, setIncomingSyncRequest] = useState<SyncConfirmationRequest | null>(null);
  const [activeSyncReport, setActiveSyncReport] = useState<SyncResult | null>(null);
  const acceptSyncRef = useRef<((req: SyncConfirmationRequest) => Promise<void>) | null>(null);

  // Electron 内置同步服务桥接：接收确认请求、回传数据量
  useEffect(() => {
    // 页面内全局兜底（Electron 主进程之外也可调用）
    (window as any).__getSyncCounts = async () => {
      const projectCount = await db.projects.filter((p) => !p.deletedAt).count();
      const noteCount = await db.notes.filter((n) => !n.deletedAt).count();
      return { noteCount, projectCount };
    };

    (window as any).__handleIncomingPhoneSync = async (remotePayload: any, mode: any = 'smart-merge') => {
      console.log('[LAN Sync] Handling incoming phone sync with mode:', mode);
      const stats = await handleServerIncomingSync(remotePayload, mode);
      const localPayload = await generateLocalSyncPayload();
      return {
        ...localPayload,
        stats,
      };
    };

    let removeSyncListener: (() => void) | null = null;
    let removeCountListener: (() => void) | null = null;

    if ((window as any).electronAPI?.onIncomingSync) {
      removeSyncListener = (window as any).electronAPI.onIncomingSync((req: any) => {
        console.log('[LAN Sync IPC] Incoming confirmation request:', req);
        const confirmationRequest: SyncConfirmationRequest = {
          id: req.id,
          from: req.from || { deviceId: 'unknown', deviceName: '移动端设备' },
          mode: req.mode || 'smart-merge',
          summary: req.summary,
          payload: req.payload,
        };

        // 电脑端主动发起、手机端已确认的同步：直接执行，避免电脑端重复弹窗
        if (req.from?.isReplyToInvite) {
          acceptSyncRef.current?.(confirmationRequest);
          return;
        }

        // 其余请求一律由用户显式确认
        setIncomingSyncRequest(confirmationRequest);
      });
    }

    if ((window as any).electronAPI?.onGetSyncCounts) {
      removeCountListener = (window as any).electronAPI.onGetSyncCounts(async (req: any) => {
        try {
          const projectCount = await db.projects.filter((p) => !p.deletedAt).count();
          const noteCount = await db.notes.filter((n) => !n.deletedAt).count();
          (window as any).electronAPI.sendSyncResponse(req.id, true, {
            noteCount,
            projectCount,
          });
        } catch {
          (window as any).electronAPI.sendSyncResponse(req.id, false, {
            noteCount: 0,
            projectCount: 0,
          });
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

  // 用户点击「允许并立即同步」
  const acceptSync = useCallback(async (req: SyncConfirmationRequest) => {
    try {
      if (req.from.deviceId === 'pc-server') {
        // 手机端接受了电脑端发起的同步邀请：由手机端向电脑端发起正式同步
        const lastTarget = getLastSyncTarget();
        try {
          const result = await syncWithRemoteServer(lastTarget.serverUrl, lastTarget.pin, req.mode, true);
          setActiveSyncReport(result);
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
  }, []);

  acceptSyncRef.current = acceptSync;

  // 用户点击「拒绝同步」
  const rejectSync = useCallback((req: SyncConfirmationRequest) => {
    if (req.from.deviceId !== 'pc-server') {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.sendSyncResponse) {
        electronAPI.sendSyncResponse(req.id, false, null, '本端用户拒绝了同步请求');
      }
    }
    setIncomingSyncRequest(null);
  }, []);

  // 手机端 / 普通浏览器：后台轮询电脑端下发的同步邀请
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

  return {
    incomingSyncRequest,
    activeSyncReport,
    acceptSync,
    rejectSync,
    setActiveSyncReport,
  };
}
