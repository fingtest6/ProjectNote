import type { NoteHistory, SyncPayload, SyncResult, SyncMode } from '../types';
import { db } from '../db';
import { writeNoteToExternalVault, deleteNoteFromExternalVault } from './vaultStorage';

const DEVICE_ID_KEY = 'project_notes_device_id';
const DEVICE_NAME_KEY = 'project_notes_device_name';
const LAST_SYNC_SERVER_KEY = 'project_notes_last_sync_server';
const LAST_SYNC_PIN_KEY = 'project_notes_last_sync_pin';

export function getLocalDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getLocalDeviceName(): string {
  let name = localStorage.getItem(DEVICE_NAME_KEY);
  if (!name) {
    const isElectron = Boolean((window as any).electronAPI);
    const userAgent = navigator.userAgent || '';
    if (isElectron) {
      name = '💻 Windows 电脑端';
    } else if (/Android/i.test(userAgent)) {
      name = '📱 Android 手机端';
    } else if (/iPhone|iPad/i.test(userAgent)) {
      name = '📱 iPhone 手机端';
    } else {
      name = '💻 桌面浏览器端';
    }
    localStorage.setItem(DEVICE_NAME_KEY, name);
  }
  return name;
}

export function saveLastSyncTarget(serverUrl: string, pin: string) {
  localStorage.setItem(LAST_SYNC_SERVER_KEY, serverUrl);
  localStorage.setItem(LAST_SYNC_PIN_KEY, pin);
}

export function getLastSyncTarget(): { serverUrl: string; pin: string } {
  return {
    serverUrl: localStorage.getItem(LAST_SYNC_SERVER_KEY) || '',
    pin: localStorage.getItem(LAST_SYNC_PIN_KEY) || '888888',
  };
}

// Generate complete sync payload from local database
export async function generateLocalSyncPayload(): Promise<SyncPayload> {
  const projects = await db.projects.toArray();
  const notes = await db.notes.toArray();
  const histories = await db.histories.toArray();

  return {
    deviceId: getLocalDeviceId(),
    deviceName: getLocalDeviceName(),
    timestamp: Date.now(),
    projects,
    notes,
    histories,
  };
}

// Check remote server online status and retrieve basic metadata
export async function checkRemoteServerStatus(serverAddress: string): Promise<{
  online: boolean;
  deviceName?: string;
  noteCount?: number;
  projectCount?: number;
  ips?: string[];
  port?: number;
  message?: string;
}> {
  let url = serverAddress.trim();
  if (!url) return { online: false, message: '请填写电脑 IP' };
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }
  if (!/:\d+$/.test(url.replace(/^https?:\/\//, ''))) {
    url = `${url}:25860`;
  }

  try {
    const deviceId = getLocalDeviceId();
    const deviceName = encodeURIComponent(getLocalDeviceName());
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${url}/api/status?deviceId=${deviceId}&deviceName=${deviceName}`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { online: false, message: `服务器响应异常 (${res.status})` };
    }

    const data = await res.json();
    return {
      online: data.status === 'ready',
      deviceName: data.deviceName || 'Windows 电脑端',
      noteCount: data.noteCount ?? 0,
      projectCount: data.projectCount ?? 0,
      ips: data.ips || [],
      port: data.port || 25860,
    };
  } catch (err: any) {
    return {
      online: false,
      message: err.name === 'AbortError' ? '连接超时' : '无法连接到电脑',
    };
  }
}

// Handle incoming sync request on the Server (PC)
export async function handleServerIncomingSync(
  clientPayload: SyncPayload,
  mode: SyncMode = 'smart-merge'
): Promise<{
  pulledNotes: number;
  pushedNotes: number;
  pulledProjects: number;
  pushedProjects: number;
  newNotesAdded: number;
  historiesSynced: number;
  details: string[];
}> {
  let pulledNotes = 0;
  let pushedNotes = 0;
  let pulledProjects = 0;
  let pushedProjects = 0;
  let newNotesAdded = 0;
  let historiesSynced = 0;
  const details: string[] = [];

  // Record this sync in local storage for PC UI display
  try {
    localStorage.setItem(
      'project_notes_last_server_sync',
      JSON.stringify({
        timestamp: Date.now(),
        deviceName: clientPayload.deviceName || '移动端',
        mode,
        clientNoteCount: clientPayload.notes ? clientPayload.notes.length : 0,
      })
    );
    window.dispatchEvent(new CustomEvent('project-notes:server-sync-received'));
  } catch (e) {}

  // 1. push-overwrite: Mobile completely overwrites server!
  if (mode === 'push-overwrite') {
    await db.notes.clear();
    await db.projects.clear();
    await db.histories.clear();

    if (clientPayload.projects && clientPayload.projects.length > 0) {
      await db.projects.bulkAdd(clientPayload.projects);
      pulledProjects = clientPayload.projects.length;
    }
    if (clientPayload.notes && clientPayload.notes.length > 0) {
      await db.notes.bulkAdd(clientPayload.notes);
      pulledNotes = clientPayload.notes.length;
      newNotesAdded = clientPayload.notes.length;
      for (const note of clientPayload.notes) {
        const proj = (clientPayload.projects || []).find((p) => p.id === note.projectId);
        if (note.deletedAt) {
          deleteNoteFromExternalVault(note.title || '无标题', proj?.name || '默认项目').catch(() => {});
        } else {
          writeNoteToExternalVault(note, proj);
        }
      }
    }
    if (clientPayload.histories && clientPayload.histories.length > 0) {
      await db.histories.bulkAdd(clientPayload.histories);
      historiesSynced = clientPayload.histories.length;
    }

    details.push(`已按手机端版本完全覆盖电脑：写入 ${clientPayload.notes.length} 篇便签、${clientPayload.projects.length} 个分类`);
    return { pulledNotes, pushedNotes, pulledProjects, pushedProjects, newNotesAdded, historiesSynced, details };
  }

  // 2. pull-overwrite: Mobile wants server's exact data, server does NOT change!
  if (mode === 'pull-overwrite') {
    const currentNotes = await db.notes.filter((n) => !n.deletedAt).count();
    details.push(`手机请求全量拉取：电脑端保持不变，已向手机传输全部 ${currentNotes} 篇便签`);
    return { pulledNotes: 0, pushedNotes: currentNotes, pulledProjects: 0, pushedProjects: 0, newNotesAdded: 0, historiesSynced: 0, details };
  }

  // 3. new-only & smart-merge
  return await mergeRemotePayload(clientPayload, mode);
}

// Merge incoming remote payload into local database with explicit sync modes
export async function mergeRemotePayload(
  remote: SyncPayload,
  mode: SyncMode = 'smart-merge'
): Promise<{
  pulledNotes: number;
  pushedNotes: number;
  pulledProjects: number;
  pushedProjects: number;
  newNotesAdded: number;
  historiesSynced: number;
  details: string[];
}> {
  let pulledNotes = 0;
  let pushedNotes = 0;
  let pulledProjects = 0;
  let pushedProjects = 0;
  let newNotesAdded = 0;
  let historiesSynced = 0;
  const details: string[] = [];

  const localProjects = await db.projects.toArray();
  const localNotes = await db.notes.toArray();
  const localHistories = await db.histories.toArray();

  const localProjectMap = new Map(localProjects.map((p) => [p.id, p]));
  const localNoteMap = new Map(localNotes.map((n) => [n.id, n]));
  const localHistoryIds = new Set(localHistories.map((h) => h.id));

  // --- MODE: PULL-OVERWRITE (以远端电脑为准完全克隆覆盖本机) ---
  if (mode === 'pull-overwrite') {
    await db.notes.clear();
    await db.projects.clear();
    await db.histories.clear();

    if (remote.projects.length > 0) {
      await db.projects.bulkAdd(remote.projects);
      pulledProjects = remote.projects.length;
    }
    if (remote.notes.length > 0) {
      await db.notes.bulkAdd(remote.notes);
      pulledNotes = remote.notes.length;
      newNotesAdded = remote.notes.length;
      for (const note of remote.notes) {
        const proj = remote.projects.find((p) => p.id === note.projectId);
        if (note.deletedAt) {
          deleteNoteFromExternalVault(note.title || '无标题', proj?.name || '默认项目').catch(() => {});
        } else {
          writeNoteToExternalVault(note, proj);
        }
      }
    }
    if (remote.histories.length > 0) {
      await db.histories.bulkAdd(remote.histories);
      historiesSynced = remote.histories.length;
    }

    details.push(`全量克隆完成：已按电脑端版本完全重置本地，共覆盖写入 ${remote.notes.length} 篇便签、${remote.projects.length} 个分类`);
    return { pulledNotes, pushedNotes, pulledProjects, pushedProjects, newNotesAdded, historiesSynced, details };
  }

  // --- 1. Merge Projects ---
  // 墓碑（删除状态）是一种带时间戳的变更，必须参与 LWW 比较：
  // 忽略它会导致「A 删了、B 还活着」永久不一致，且墓碑日后回收时 B 的旧副本会复活。
  for (const remProj of remote.projects) {
    const locProj = localProjectMap.get(remProj.id);
    if (!locProj) {
      if (!remProj.deletedAt) {
        await db.projects.put(remProj);
        pulledProjects++;
        details.push(`[拉取项目] 新增项目分类「${remProj.name}」`);
      }
      continue;
    }

    if (mode === 'new-only') continue;

    if (remProj.updatedAt > locProj.updatedAt) {
      await db.projects.put(remProj);
      // 双方都已删除时无需重复上报，只同步时间戳
      if (!(remProj.deletedAt && locProj.deletedAt)) {
        pulledProjects++;
        details.push(
          remProj.deletedAt
            ? `[删除同步] 项目分类「${remProj.name}」已在对方删除`
            : `[更新项目] 项目「${remProj.name}」已更新为远端最新设置`
        );
      }
    } else if (locProj.updatedAt > remProj.updatedAt) {
      if (!(locProj.deletedAt && remProj.deletedAt)) {
        pushedProjects++;
        if (locProj.deletedAt) {
          details.push(`[删除同步] 本机已删除的项目「${locProj.name}」，对方将同步删除`);
        }
      }
    }
  }

  // Count local projects that remote doesn't have
  const remoteProjIds = new Set(remote.projects.map((p) => p.id));
  for (const locProj of localProjects) {
    if (remoteProjIds.has(locProj.id)) continue;
    // 对方没有该分类：墓碑没有可同步的对象，不上报，避免每次同步都重复刷
    if (locProj.deletedAt) continue;

    pushedProjects++;
    details.push(`[推送项目] 本地新项目「${locProj.name}」已推送至对方`);
  }

  // --- 2. Merge Notes ---
  // 墓碑按 updatedAt 参与 LWW；双方都已删除时不上报，避免报告噪音。
  for (const remNote of remote.notes) {
    const locNote = localNoteMap.get(remNote.id);
    if (!locNote) {
      if (!remNote.deletedAt) {
        await db.notes.put(remNote);
        pulledNotes++;
        newNotesAdded++;
        details.push(`[拉取新增] 便签「${remNote.title || '无标题'}」`);
        const proj = await db.projects.get(remNote.projectId);
        writeNoteToExternalVault(remNote, proj);
      }
      continue;
    }

    if (mode === 'new-only') continue;

    if (remNote.updatedAt > locNote.updatedAt) {
      await db.notes.put(remNote);
      if (!(remNote.deletedAt && locNote.deletedAt)) {
        pulledNotes++;
        const proj = await db.projects.get(remNote.projectId);
        if (remNote.deletedAt) {
          details.push(`[删除同步] 便签「${remNote.title || '无标题'}」已在对方删除`);
          deleteNoteFromExternalVault(remNote.title || '无标题', proj?.name || '默认项目').catch(() => {});
        } else {
          details.push(`[拉取更新] 便签「${remNote.title}」(对方版本更新)`);
          writeNoteToExternalVault(remNote, proj);
        }
      }
    } else if (locNote.updatedAt > remNote.updatedAt) {
      if (!(locNote.deletedAt && remNote.deletedAt)) {
        pushedNotes++;
        if (locNote.deletedAt) {
          details.push(`[删除同步] 本机已删除的便签「${locNote.title || '无标题'}」，对方将同步删除`);
        } else {
          details.push(`[推送更新] 便签「${locNote.title}」(本机版本更新)`);
        }
      }
    }
  }

  // Count local notes that remote doesn't have
  const remoteNoteIds = new Set(remote.notes.map((n) => n.id));
  for (const locNote of localNotes) {
    if (remoteNoteIds.has(locNote.id)) continue;
    // 对方没有这条便签：墓碑没有可同步的对象，不上报
    if (locNote.deletedAt) continue;

    pushedNotes++;
    details.push(`[推送新增] 本地新建便签「${locNote.title || '无标题'}」已推送到对方`);
  }

  // --- 3. Merge Git Histories ---
  const newHistories: NoteHistory[] = [];
  for (const remHist of remote.histories) {
    if (!localHistoryIds.has(remHist.id)) {
      newHistories.push(remHist);
      historiesSynced++;
    }
  }
  if (newHistories.length > 0) {
    await db.histories.bulkAdd(newHistories);
  }

  return { pulledNotes, pushedNotes, pulledProjects, pushedProjects, newNotesAdded, historiesSynced, details };
}

// Perform LAN sync request from client (Phone or secondary PC) to Server (Primary PC)
export async function syncWithRemoteServer(
  serverAddress: string,
  pin: string,
  mode: SyncMode = 'smart-merge',
  isReplyToInvite: boolean = false
): Promise<SyncResult> {
  // Normalize address
  let url = serverAddress.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }
  if (!/:\d+$/.test(url.replace(/^https?:\/\//, ''))) {
    url = `${url}:25860`;
  }

  try {
    const localPayload = await generateLocalSyncPayload();

    const controller = new AbortController();
    // Allow up to 50s for the receiving device user to read and confirm the prompt
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    const response = await fetch(`${url}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pin,
        mode,
        from: {
          deviceId: localPayload.deviceId,
          deviceName: localPayload.deviceName,
          isReplyToInvite,
        },
        summary: {
          // 数量只统计未删除项；墓碑仍随 payload 传输，但不计入展示数字
          noteCount: localPayload.notes.filter((n) => !n.deletedAt).length,
          projectCount: localPayload.projects.filter((p) => !p.deletedAt).length,
        },
        payload: localPayload,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        accepted: false,
        mode,
        pulledNotes: 0,
        pushedNotes: 0,
        pulledProjects: 0,
        pushedProjects: 0,
        message: `同步失败: ${response.status} ${errText || '连接异常'}`,
      };
    }

    const data = await response.json();
    if (data.accepted === false) {
      return {
        success: false,
        accepted: false,
        mode,
        pulledNotes: 0,
        pushedNotes: 0,
        pulledProjects: 0,
        pushedProjects: 0,
        message: data.message || '对方设备拒绝了本次同步请求',
      };
    }

    if (!data.success || !data.payload) {
      return {
        success: false,
        accepted: false,
        mode,
        pulledNotes: 0,
        pushedNotes: 0,
        pulledProjects: 0,
        pushedProjects: 0,
        message: data.message || '远程设备拒绝或未能完成同步',
      };
    }

    // Merge remote data into local database
    let stats;
    if (mode === 'push-overwrite') {
      const liveNoteCount = localPayload.notes.filter((n) => !n.deletedAt).length;
      stats = {
        pulledNotes: 0,
        pushedNotes: liveNoteCount,
        pulledProjects: 0,
        pushedProjects: localPayload.projects.length,
        newNotesAdded: 0,
        historiesSynced: 0,
        details: [`【完全推送成功】已将本机 ${liveNoteCount} 篇便签完全覆盖写入对方设备！`],
      };
    } else {
      stats = await mergeRemotePayload(data.payload, mode);
    }

    saveLastSyncTarget(serverAddress, pin);

    const modeLabels: Record<SyncMode, string> = {
      'smart-merge': '双向智能合并',
      'push-overwrite': '完全覆盖电脑端',
      'pull-overwrite': '完全覆盖本机',
      'new-only': '仅同步新增便签',
    };

    const modeDesc = modeLabels[mode] || '互联同步';

    return {
      success: true,
      accepted: true,
      mode,
      perspective: 'initiator',
      pulledNotes: stats.pulledNotes,
      pushedNotes: stats.pushedNotes,
      pulledProjects: stats.pulledProjects,
      pushedProjects: stats.pushedProjects,
      newNotesAdded: stats.newNotesAdded,
      historiesSynced: stats.historiesSynced,
      message: `【${modeDesc}】同步完成！从电脑拉取更新 ${stats.pulledNotes} 篇，向电脑推送更新 ${stats.pushedNotes} 篇，新增便签 ${stats.newNotesAdded} 篇`,
      details: stats.details,
    };
  } catch (err: any) {
    console.error('Sync failed:', err);
    let reason = err.message || '';
    if (err.name === 'AbortError') {
      reason = '连接超时：对方设备未在 50 秒内点击确认允许，或网络未联通';
    } else if (reason.includes('Failed to fetch')) {
      reason = '无法连接到对方设备：请确认设备处于同一 Wi-Fi 且局域网互联服务已开启';
    }
    return {
      success: false,
      accepted: false,
      mode,
      pulledNotes: 0,
      pushedNotes: 0,
      pulledProjects: 0,
      pushedProjects: 0,
      message: reason,
    };
  }
}

// Mobile device polling loop to listen for sync invitations from PC
export async function pollDeviceTask(
  serverAddress: string,
  onTask: (task: {
    type: string;
    mode: SyncMode;
    from: string;
    noteCount?: number;
    projectCount?: number;
  }) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  let url = serverAddress.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }
  if (!/:\d+$/.test(url.replace(/^https?:\/\//, ''))) {
    url = `${url}:25860`;
  }

  const deviceId = getLocalDeviceId();
  const deviceName = encodeURIComponent(getLocalDeviceName());

  // 长轮询兜底超时：电脑端异常时也能及时回到循环重试，避免手机端监听永久卡死
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  const forwardAbort = () => controller.abort();
  if (abortSignal) {
    if (abortSignal.aborted) {
      controller.abort();
    } else {
      abortSignal.addEventListener('abort', forwardAbort);
    }
  }

  try {
    const res = await fetch(`${url}/api/device/poll?deviceId=${deviceId}&deviceName=${deviceName}`, {
      signal: controller.signal,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.hasTask && data.task) {
        onTask(data.task);
      }
    }
  } catch (e) {
    // Ignore network / poll abort errors
  } finally {
    clearTimeout(timeoutId);
    if (abortSignal) abortSignal.removeEventListener('abort', forwardAbort);
  }
}
