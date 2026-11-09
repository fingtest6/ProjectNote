import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Wifi,
  HardDrive,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Smartphone,
  Laptop,
  ShieldCheck,
  Pencil,
  FolderCheck,
  Camera,
  ScanLine,
  ChevronDown,
  ChevronUp,
  Sparkles,
  PlusCircle,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import type { Project, Note, VaultConfig, SyncMode, SyncResult } from '../types';
import {
  getVaultConfig,
  saveVaultConfig,
  pickVaultFolder,
  updateVaultFolderPath,
  exportAllToExternalVault,
} from '../utils/vaultStorage';
import {
  syncWithRemoteServer,
  checkRemoteServerStatus,
  getLastSyncTarget,
  saveLastSyncTarget,
} from '../utils/syncProtocol';

interface SyncVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  notes: Note[];
  onDataChanged: () => void;
  onOpenReport?: (res: SyncResult) => void;
}

const SYNC_MODES: {
  id: SyncMode;
  name: string;
  badge: string;
  badgeColor: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'smart-merge',
    name: '双向智能合并',
    badge: '推荐 · 无损',
    badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    desc: '双方新增互相保留；同一便签修改以最新编辑时间为准，自动融合历史版本。',
    icon: Sparkles,
  },
  {
    id: 'new-only',
    name: '仅同步新增便签',
    badge: '安全 · 不覆盖',
    badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
    desc: '仅同步双方各自新创建的便签，双方已有便签内容绝不改动。',
    icon: PlusCircle,
  },
  {
    id: 'push-overwrite',
    name: '以本机为准覆盖电脑',
    badge: '完全推送',
    badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    desc: '将本机所有分类与便签全量推送到电脑端，电脑端数据与本机完全一致。',
    icon: ArrowUp,
  },
  {
    id: 'pull-overwrite',
    name: '以电脑为准覆盖本机',
    badge: '完全拉取',
    badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
    desc: '从电脑端全量拉取数据并重置覆盖本机便签与分类（本机便签将被电脑替换）。',
    icon: ArrowDown,
  },
];

// 电脑端「主动发起」时，模式含义以电脑自身为视角，与手机端页面上的同名模式相反：
// 电脑端 push-overwrite = 电脑覆盖手机；手机端执行时需换算成 pull-overwrite。
// 因此电脑端不能复用 SYNC_MODES 的文案，否则会误导用户覆盖方向。
const PC_SYNC_MODES: typeof SYNC_MODES = [
  {
    id: 'smart-merge',
    name: '双向智能合并',
    badge: '推荐 · 无损',
    badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    desc: '双方新增互相保留；同一便签按最新编辑时间合并。',
    icon: Sparkles,
  },
  {
    id: 'new-only',
    name: '仅同步新增便签',
    badge: '安全 · 不覆盖',
    badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
    desc: '仅同步双方各自新增的便签，双方已有便签内容绝不改动。',
    icon: PlusCircle,
  },
  {
    id: 'push-overwrite',
    name: '以电脑为准覆盖手机',
    badge: '完全推送',
    badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    desc: '用电脑端全部数据覆盖手机，手机现有便签将被替换。',
    icon: ArrowUp,
  },
  {
    id: 'pull-overwrite',
    name: '以手机为准覆盖电脑',
    badge: '完全拉取',
    badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
    desc: '用手机端全部数据覆盖电脑，电脑现有便签将被替换。',
    icon: ArrowDown,
  },
];

// 电脑端作为接收方时，用于展示「手机发起的同步」的模式含义
const SERVER_SYNC_MODE_LABELS: Record<SyncMode, string> = {
  'smart-merge': '双向智能合并',
  'new-only': '仅同步新增便签',
  'push-overwrite': '手机全量覆盖电脑',
  'pull-overwrite': '电脑全量覆盖手机',
};

const ANDROID_FOLDER_PRESETS = [
  { label: '文档 / 项目便签 (推荐)', path: 'Documents/ProjectNotes' },
  { label: '文档 / NotesVault', path: 'Documents/NotesVault' },
  { label: '下载 / 项目便签', path: 'Download/ProjectNotes' },
  { label: '设备根目录 / ProjectNotes', path: 'ProjectNotes' },
];

export const SyncVaultModal: React.FC<SyncVaultModalProps> = ({
  isOpen,
  onClose,
  projects,
  notes,
  onDataChanged,
  onOpenReport,
}) => {
  const [activeTab, setActiveTab] = useState<'sync' | 'vault'>('sync');

  // Vault state
  const [vaultConfig, setVaultConfigState] = useState<VaultConfig>(getVaultConfig());
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [customFolderPath, setCustomFolderPath] = useState('');

  // Sync state
  const isElectron = Boolean((window as any).electronAPI);
  const [serverIps, setServerIps] = useState<string[]>([]);
  const [selectedServerIp, setSelectedServerIp] = useState<string>('');
  const [serverPort, setServerPort] = useState<number>(25860);
  const [serverPin, setServerPin] = useState<string>('888888');
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // PC Active Trigger state
  const [connectedDevices, setConnectedDevices] = useState<{ deviceId: string; deviceName: string }[]>([]);
  const [isTriggeringMobile, setIsTriggeringMobile] = useState(false);

  // Client sync form (for mobile or client mode)
  const [targetIp, setTargetIp] = useState<string>('');
  const [clientPin, setClientPin] = useState<string>('888888');
  const [syncMode, setSyncMode] = useState<SyncMode>('smart-merge');
  const [remoteInfo, setRemoteInfo] = useState<{
    checking: boolean;
    online: boolean;
    deviceName?: string;
    noteCount?: number;
    projectCount?: number;
    message?: string;
  }>({
    checking: false,
    online: false,
  });
  const [detailedResult, setDetailedResult] = useState<SyncResult | null>(null);
  const [showDetailsList, setShowDetailsList] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastServerSync, setLastServerSync] = useState<{
    timestamp: number;
    deviceName: string;
    mode: string;
    clientNoteCount: number;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('project_notes_last_server_sync');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Listen for live incoming phone sync events on PC
  useEffect(() => {
    const handleSyncReceived = () => {
      try {
        const saved = localStorage.getItem('project_notes_last_server_sync');
        if (saved) setLastServerSync(JSON.parse(saved));
      } catch {}
      onDataChanged();
    };
    window.addEventListener('project-notes:server-sync-received', handleSyncReceived);
    return () => window.removeEventListener('project-notes:server-sync-received', handleSyncReceived);
  }, [onDataChanged]);

  // QR Code Camera Scanner State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    // Load initial vault config
    const currentCfg = getVaultConfig();
    setVaultConfigState(currentCfg);
    setCustomFolderPath(currentCfg.folderPath || 'Documents/ProjectNotes');

    // Load last sync target
    const lastTarget = getLastSyncTarget();
    if (lastTarget.serverUrl) setTargetIp(lastTarget.serverUrl);
    if (lastTarget.pin) setClientPin(lastTarget.pin);

    // If running in Electron, fetch server info
    if (isElectron && (window as any).electronAPI?.getSyncServerInfo) {
      (window as any).electronAPI.getSyncServerInfo().then((info: any) => {
        if (info.ips && info.ips.length > 0) {
          setServerIps(info.ips);
          const primaryIp = info.ips[0] || '127.0.0.1';
          setSelectedServerIp(primaryIp);
          const pairingUrl = `projectnotes://sync?ip=${primaryIp}&port=${info.port}&pin=${info.pin}`;
          QRCode.toDataURL(pairingUrl, { width: 200, margin: 1 }, (_err, url) => {
            if (url) setQrDataUrl(url);
          });
        }
        if (info.port) setServerPort(info.port);
        if (info.pin) setServerPin(info.pin);
      });
    }
  }, [isOpen, isElectron]);

  // Poll connected mobile devices on PC to enable one-click active sync
  useEffect(() => {
    if (!isOpen || !isElectron) return;

    const fetchDevices = async () => {
      if ((window as any).electronAPI?.getConnectedDevices) {
        try {
          const list = await (window as any).electronAPI.getConnectedDevices();
          setConnectedDevices(list || []);
        } catch (e) {
          console.error('Fetch connected devices error:', e);
        }
      }
    };

    fetchDevices();
    const interval = setInterval(fetchDevices, 2500);
    return () => clearInterval(interval);
  }, [isOpen, isElectron]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Stop camera stream & scan loop
  const stopScanner = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsScannerOpen(false);
    setScannerError(null);
  };

  // Start QR code camera scanning
  const startScanner = async () => {
    setIsScannerOpen(true);
    setScannerError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode: 'environment' },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        scanQRCodeFrame();
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setScannerError('无法访问摄像头，请检查是否已在系统设置中授予应用相机权限。');
    }
  };

  // Video frame scanning loop using jsQR
  const scanQRCodeFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanQRCodeFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(scanQRCodeFrame);
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (code && code.data) {
      const scannedData = code.data.trim();
      handleScannedQRCode(scannedData);
      return;
    }

    animFrameRef.current = requestAnimationFrame(scanQRCodeFrame);
  };

  // Parse scanned QR code content and trigger sync
  const handleScannedQRCode = (data: string) => {
    let resolvedIp = '';
    let resolvedPin = '888888';

    if (data.startsWith('projectnotes://sync')) {
      try {
        const dummyUrl = new URL(data.replace('projectnotes://sync', 'http://dummy.local'));
        const ip = dummyUrl.searchParams.get('ip');
        const port = dummyUrl.searchParams.get('port') || '25860';
        const pin = dummyUrl.searchParams.get('pin');
        if (ip) resolvedIp = `${ip}:${port}`;
        if (pin) resolvedPin = pin;
      } catch (e) {
        console.error('QR URL parse error:', e);
      }
    } else if (data.startsWith('http://') || data.startsWith('https://')) {
      try {
        const url = new URL(data);
        resolvedIp = url.host;
        const pin = url.searchParams.get('pin');
        if (pin) resolvedPin = pin;
      } catch (e) {
        console.error('QR URL parse error:', e);
      }
    } else {
      resolvedIp = data;
    }

    if (resolvedIp) {
      setTargetIp(resolvedIp);
      setClientPin(resolvedPin);
      stopScanner();
      setSyncMessage({
        text: `📷 扫码成功！已自动识别电脑目标：${resolvedIp}，正在同步...`,
        success: true,
      });

      // Auto trigger sync with scanned credentials
      setTimeout(() => {
        executeSync(resolvedIp, resolvedPin, syncMode);
      }, 300);
    } else {
      setScannerError('未识别到有效的电脑互联二维码，请对准电脑屏幕上的配对码重试。');
    }
  };

  // Check remote server online status & get device data count
  const checkRemoteStatus = useCallback(async (address: string) => {
    if (!address || !address.trim()) {
      setRemoteInfo({ checking: false, online: false, message: '请填写电脑 IP 地址' });
      return;
    }
    setRemoteInfo((prev) => ({ ...prev, checking: true }));
    try {
      const res = await checkRemoteServerStatus(address.trim());
      setRemoteInfo({
        checking: false,
        online: res.online,
        deviceName: res.deviceName,
        noteCount: res.noteCount,
        projectCount: res.projectCount,
        message: res.message,
      });

      // 连接成功即记住这台电脑：手机端后台轮询才能立刻开始接收电脑端发起的同步邀请
      if (res.online) {
        saveLastSyncTarget(address.trim(), clientPin);
      }
    } catch {
      setRemoteInfo({
        checking: false,
        online: false,
        message: '连接失败',
      });
    }
  }, [clientPin]);

  // Debounced auto-check remote server when targetIp changes or modal opens
  useEffect(() => {
    if (!isOpen || !targetIp.trim()) return;
    const timer = setTimeout(() => {
      checkRemoteStatus(targetIp);
    }, 600);
    return () => clearTimeout(timer);
  }, [isOpen, targetIp, checkRemoteStatus]);

  // Change / Select Vault Directory
  const handlePickVaultFolder = async () => {
    if (isElectron) {
      const chosen = await pickVaultFolder();
      if (chosen) {
        const updated = getVaultConfig();
        setVaultConfigState(updated);
        setVaultMessage(`✅ 外部存储路径已成功设为：${chosen}`);
        setTimeout(() => setVaultMessage(null), 4000);
      }
    } else {
      // Mobile (Android) / Web custom folder picker dialog
      setCustomFolderPath(vaultConfig.folderPath || 'Documents/ProjectNotes');
      setIsFolderPickerOpen(true);
    }
  };

  // Confirm custom mobile folder selection
  const handleConfirmMobileFolder = (path: string) => {
    const cleanPath = path.trim() || 'Documents/ProjectNotes';
    const updated = updateVaultFolderPath(cleanPath);
    setVaultConfigState(updated);
    setIsFolderPickerOpen(false);
    setVaultMessage(`✅ 外部存储路径已成功切换为：${cleanPath}`);
    setTimeout(() => setVaultMessage(null), 4000);
  };

  // Full Export to Vault
  const handleFullExportVault = async () => {
    setIsExporting(true);
    setVaultMessage('正在将全部便签及附件写入外部存储文件夹...');
    try {
      const res = await exportAllToExternalVault(projects, notes);
      setVaultMessage(`✅ 全量同步完成！已将 ${res.count} 篇便签写入：${res.path}`);
      setVaultConfigState(getVaultConfig());
    } catch (err: any) {
      setVaultMessage(`❌ 导出失败: ${err.message}`);
    } finally {
      setIsExporting(false);
      setTimeout(() => setVaultMessage(null), 5000);
    }
  };

  // Execute client sync logic with chosen mode
  const executeSync = async (ip: string, pin: string, modeToUse: SyncMode = syncMode) => {
    if (!ip.trim()) {
      setSyncMessage({ text: '请填写电脑的局域网 IP 地址（例如 192.168.1.100）', success: false });
      return;
    }

    setIsSyncing(true);
    setSyncMessage(null);
    setDetailedResult(null);

    const res = await syncWithRemoteServer(ip.trim(), pin.trim(), modeToUse);
    setIsSyncing(false);
    setDetailedResult(res);
    setSyncMessage({ text: res.message || '', success: res.success });

    // Refresh remote status
    checkRemoteStatus(ip);

    if (res.success) {
      onDataChanged();
      if (res.details && res.details.length > 0) {
        setShowDetailsList(true);
      }
    }

    // 同步结束（成功 / 被拒绝 / 超时）都弹出完整报告，避免用户只看到一闪而过的提示
    if (onOpenReport) {
      onOpenReport(res);
    }
  };

  const handleStartSync = () => {
    executeSync(targetIp, clientPin, syncMode);
  };

  // Trigger mobile sync invitation from PC to a connected phone
  const handleTriggerMobileSync = async (deviceId?: string, targetName?: string) => {
    if (!(window as any).electronAPI?.triggerMobileSync) return;
    setIsTriggeringMobile(true);
    setSyncMessage({
      text: `已向【${targetName || '移动端设备'}】发送同步请求，请在手机屏幕上点击【允许】以完成同步...`,
      success: true,
    });
    try {
      await (window as any).electronAPI.triggerMobileSync({
        deviceId,
        mode: syncMode,
        // 让手机端确认弹窗能显示电脑端真实的数据量，而不是 0 篇
        noteCount: notes.length,
        projectCount: projects.length,
      });
    } catch (e: any) {
      setSyncMessage({
        text: `发送同步请求失败: ${e.message}`,
        success: false,
      });
    } finally {
      setIsTriggeringMobile(false);
    }
  };

  // Render detail item badge
  const renderDetailItem = (detail: string, index: number) => {
    let tagColor = 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300';
    let tagText = '记录';
    let content = detail;

    if (detail.startsWith('[删除同步]')) {
      tagColor = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
      tagText = '删除同步';
      content = detail.replace('[删除同步]', '').trim();
    } else if (detail.startsWith('[新增拉取]')) {
      tagColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
      tagText = '新增拉取';
      content = detail.replace('[新增拉取]', '').trim();
    } else if (detail.startsWith('[拉取更新]')) {
      tagColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20';
      tagText = '拉取更新';
      content = detail.replace('[拉取更新]', '').trim();
    } else if (detail.startsWith('[推送更新]')) {
      tagColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
      tagText = '推送更新';
      content = detail.replace('[推送更新]', '').trim();
    } else if (detail.startsWith('[推送新增]')) {
      tagColor = 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20';
      tagText = '推送新增';
      content = detail.replace('[推送新增]', '').trim();
    } else if (detail.startsWith('[拉取项目]') || detail.startsWith('[拉取分类]')) {
      tagColor = 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20';
      tagText = '分类同步';
      content = detail.replace(/^\[(拉取分类|拉取项目)\]/, '').trim();
    } else if (detail.startsWith('[推送项目]') || detail.startsWith('[推送分类]')) {
      tagColor = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20';
      tagText = '分类推送';
      content = detail.replace(/^\[(推送分类|推送项目)\]/, '').trim();
    }

    return (
      <div
        key={index}
        className="flex items-start gap-2 py-1.5 px-2.5 rounded-lg bg-white dark:bg-zinc-850 border border-slate-100 dark:border-zinc-800 text-[11px]"
      >
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${tagColor}`}>
          {tagText}
        </span>
        <span className="text-slate-700 dark:text-zinc-300 flex-1 break-all leading-relaxed">
          {content}
        </span>
      </div>
    );
  };

  // 重新生成配对二维码
  const regeneratePairingQr = useCallback(
    (ip: string, port: number, pin: string) => {
      if (!ip) return;
      const pairingUrl = `projectnotes://sync?ip=${ip}&port=${port}&pin=${pin}`;
      QRCode.toDataURL(pairingUrl, { width: 200, margin: 1 }, (_err, url) => {
        if (url) setQrDataUrl(url);
      });
    },
    []
  );

  // Select IP and regenerate QR code
  const handleSelectServerIp = (ip: string) => {
    setSelectedServerIp(ip);
    navigator.clipboard.writeText(`${ip}:${serverPort}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    regeneratePairingQr(ip, serverPort, serverPin);
  };

  // 修改配对码（仅 Electron 桌面端）
  const handleStartEditPin = () => {
    setPinDraft(serverPin);
    setPinError(null);
    setIsEditingPin(true);
  };

  const handleSavePin = async () => {
    const nextPin = pinDraft.trim();
    if (!/^\d{6}$/.test(nextPin)) {
      setPinError('配对码必须是 6 位数字');
      return;
    }

    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.setSyncPin) {
      setPinError('当前环境不支持修改配对码');
      return;
    }

    setPinSaving(true);
    try {
      const saved = await electronAPI.setSyncPin(nextPin);
      const effective = String(saved || nextPin);
      setServerPin(effective);
      setIsEditingPin(false);
      setPinError(null);
      setSyncMessage({
        text: `配对码已更新为 ${effective}，手机端需要重新输入新配对码后才能继续同步。`,
        success: true,
      });
      regeneratePairingQr(selectedServerIp, serverPort, effective);
    } catch (e: any) {
      setPinError(e?.message || '保存失败，请重试');
    } finally {
      setPinSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-scale">
      <div
        className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-200/80 dark:border-zinc-800 flex flex-col max-h-[90vh] animate-slide-up-spring"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className="px-5 py-3 border-b border-slate-200/80 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-850/50"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-theme/15 text-theme flex items-center justify-center">
              {isElectron ? <Laptop className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-800 dark:text-zinc-100">
                {isElectron ? '电脑端局域网同步中心' : '手机与电脑互联同步'}
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                {isElectron
                  ? '局域网零云端秒同步 · 移动端扫码即连 · 同步需双方确认'
                  : '局域网零云端秒同步 · 与电脑无缝连接'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="touch-press w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Segmented Control */}
        <div className="p-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900 flex justify-center">
          <div className="inline-flex rounded-xl p-1 bg-slate-200/80 dark:bg-zinc-800 w-full max-w-xs text-xs font-medium">
            <button
              onClick={() => setActiveTab('sync')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'sync'
                  ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>电脑手机互联</span>
            </button>
            <button
              onClick={() => setActiveTab('vault')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'vault'
                  ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>外部存储目录</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: 电脑手机互联 (LAN Sync) */}
          {activeTab === 'sync' && (
            <div className="space-y-4">
              {/* Sync Message Alert */}
              {syncMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    syncMessage.success
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {syncMessage.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span className="flex-1 break-all leading-relaxed">{syncMessage.text}</span>
                </div>
              )}

              {/* === VIEW 1: PC 电脑端 (主机服务端中心) === */}
              {isElectron ? (
                <div className="space-y-4">
                  {/* Server Host Info Card */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/80 dark:border-zinc-700/60 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <Laptop className="w-4 h-4 text-theme" />
                        电脑端局域网同步服务正常运行中
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                        端口 {serverPort}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
                      {qrDataUrl && (
                        <div className="p-2.5 rounded-2xl bg-white shadow-xs border border-slate-200 shrink-0 text-center">
                          <img src={qrDataUrl} alt="手机扫码配对" className="w-36 h-36 object-contain" />
                          <div className="text-[10px] text-slate-400 pt-1 font-medium">手机扫码快速连接</div>
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-2.5 w-full text-center sm:text-left">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                          电脑局域网 IP (点击切换并复制)
                        </div>
                        <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
                          {serverIps.map((ip) => (
                            <button
                              key={ip}
                              onClick={() => handleSelectServerIp(ip)}
                              className={`touch-press px-2.5 py-1 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all ${
                                selectedServerIp === ip
                                  ? 'bg-theme text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700'
                              }`}
                              title="点击切换为此 IP（二维码将自动更新）"
                            >
                              <span>{ip}</span>
                              {selectedServerIp === ip ? (
                                <Check className="w-3 h-3 text-white" />
                              ) : copied ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-400" />
                              )}
                            </button>
                          ))}
                        </div>

                        <div className="pt-0.5 flex items-center justify-center sm:justify-start gap-2 text-xs text-slate-600 dark:text-zinc-300 flex-wrap">
                          <ShieldCheck className="w-3.5 h-3.5 text-theme" />
                          <span>配对安全码 (PIN)：</span>
                          <span className="font-mono font-bold text-theme bg-theme/10 px-2.5 py-0.5 rounded-lg border border-theme/20">
                            {serverPin}
                          </span>
                          {!isEditingPin && (
                            <button
                              onClick={handleStartEditPin}
                              className="touch-press flex items-center gap-1 text-[11px] font-medium text-theme hover:underline"
                            >
                              <Pencil className="w-3 h-3" />
                              修改
                            </button>
                          )}
                        </div>

                        {isEditingPin && (
                          <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 space-y-2 text-left">
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                              设置新的 6 位数字配对码；修改后手机端需要重新输入。
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={pinDraft}
                                maxLength={6}
                                onChange={(e) => {
                                  setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 6));
                                  setPinError(null);
                                }}
                                placeholder="6 位数字"
                                className="w-24 px-2.5 py-1.5 text-xs font-mono tracking-widest rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-theme/30 text-slate-900 dark:text-zinc-100"
                              />
                              <button
                                onClick={() => {
                                  setPinDraft(String(Math.floor(100000 + Math.random() * 900000)));
                                  setPinError(null);
                                }}
                                disabled={pinSaving}
                                className="touch-press px-2 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 flex items-center gap-1 disabled:opacity-50"
                              >
                                <RefreshCw className="w-3 h-3" />
                                随机
                              </button>
                              <button
                                onClick={handleSavePin}
                                disabled={pinSaving || pinDraft.length !== 6}
                                className="touch-press px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-theme text-white disabled:opacity-50"
                              >
                                {pinSaving ? '保存中...' : '保存'}
                              </button>
                              <button
                                onClick={() => {
                                  setIsEditingPin(false);
                                  setPinError(null);
                                }}
                                disabled={pinSaving}
                                className="touch-press px-2 py-1.5 rounded-lg text-[11px] text-slate-500 dark:text-zinc-400 disabled:opacity-50"
                              >
                                取消
                              </button>
                            </div>
                            {pinError && <div className="text-[11px] text-rose-500">{pinError}</div>}
                          </div>
                        )}

                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed bg-theme/5 p-2 rounded-xl border border-theme/10">
                          📱 打开手机端「项目便签」，点击右上角互联图标 -&gt;【扫码连接电脑】对准左侧二维码即可秒速同步！
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* PC Note Database Status & Live Sync Activity */}
                  <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                        <Laptop className="w-4 h-4 text-theme" />
                        电脑端便签数据概览
                      </span>
                      <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                        <span className="font-bold text-slate-900 dark:text-white">{notes.length}</span> 篇便签 ·{' '}
                        <span className="font-bold text-slate-900 dark:text-white">{projects.length}</span> 个分类
                      </span>
                    </div>

                    {/* Sync Activity Monitor */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-theme shrink-0" />
                        {lastServerSync ? (
                          <div className="space-y-0.5">
                            <div className="text-slate-800 dark:text-zinc-200 font-medium">
                              最近一次手机同步来自：{lastServerSync.deviceName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              时间：{new Date(lastServerSync.timestamp).toLocaleTimeString()} · 模式：
                              {SERVER_SYNC_MODE_LABELS[lastServerSync.mode as SyncMode] || lastServerSync.mode}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 dark:text-zinc-400">
                            正在等待手机端发起互联同步... (局域网内任意手机扫码即可连接)
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                        服务监听中
                      </span>
                    </div>
                  </div>

                  {/* PC Active Sync Trigger Section */}
                  <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-theme" />
                        电脑主动发起互联同步
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-theme/10 text-theme">
                        选择模式后一键同步
                      </span>
                    </div>

                    {/* Sync Mode Selector */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                        同步模式：<span className="text-theme">{PC_SYNC_MODES.find((m) => m.id === syncMode)?.name}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {PC_SYNC_MODES.map((m) => {
                          const Icon = m.icon;
                          const isSelected = syncMode === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setSyncMode(m.id)}
                              className={`touch-press p-2 rounded-xl border text-left transition-all ${
                                isSelected
                                  ? 'border-theme bg-theme/5 ring-1 ring-theme/30'
                                  : 'border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/40 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-800 dark:text-zinc-100 flex items-center gap-1">
                                  <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-theme' : 'text-slate-400'}`} />
                                  {m.name}
                                </span>
                                <span className={`text-[9px] px-1 py-0.5 rounded font-semibold ${m.badgeColor}`}>
                                  {m.badge}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1 line-clamp-1">
                                {m.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Connected Mobile Devices List */}
                    <div className="space-y-2 pt-1">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                        <span>已在线的移动端设备</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {connectedDevices.length > 0 ? `${connectedDevices.length} 台在线` : '等待连接'}
                        </span>
                      </div>

                      {connectedDevices.length > 0 ? (
                        <div className="space-y-2">
                          {connectedDevices.map((dev) => (
                            <div
                              key={dev.deviceId}
                              className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/60 dark:border-zinc-700/60 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                  <Smartphone className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-slate-800 dark:text-zinc-100 truncate">
                                    {dev.deviceName}
                                  </div>
                                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                    ● 在线已就绪 · 点击发起同步
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => handleTriggerMobileSync(dev.deviceId, dev.deviceName)}
                                disabled={isTriggeringMobile || isSyncing}
                                className="touch-press px-3.5 py-1.5 rounded-xl bg-theme hover:brightness-95 text-white font-medium text-xs flex items-center gap-1.5 shrink-0 shadow-xs active:scale-98 transition-all disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isTriggeringMobile ? 'animate-spin' : ''}`} />
                                <span>向此手机发起同步</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-zinc-800/30 border border-dashed border-slate-200 dark:border-zinc-700/60 text-center text-xs text-slate-400 dark:text-zinc-500 space-y-1">
                          <p>📱 暂未检测到在线手机。手机端打开「电脑手机互联」后将在此自动就绪。</p>
                          <p className="text-[11px] text-theme font-medium">
                            提示：手机端也可随时直接扫码上方二维码快速同步。
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Direct IP input for manual target sync from PC */}
                    <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                        或向指定目标设备 IP 发起同步 (多设备/跨网段)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={targetIp}
                          onChange={(e) => setTargetIp(e.target.value)}
                          placeholder="例如：192.168.5.20:25860"
                          className="sm:col-span-2 px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100"
                        />
                        <input
                          type="text"
                          value={clientPin}
                          onChange={(e) => setClientPin(e.target.value)}
                          placeholder="配对码 (888888)"
                          className="px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100"
                        />
                      </div>
                      <button
                        onClick={handleStartSync}
                        disabled={isSyncing}
                        className="touch-press w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>{isSyncing ? '正在连接同步中...' : '从电脑向目标 IP 发起同步'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* === VIEW 2: 手机端 (移动客户端，负责扫码/输入/同步) === */
                <div className="space-y-4">
                  {/* Device & Data Comparison Card */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/80 dark:border-zinc-700/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                        设备与数据对照
                      </span>
                      <button
                        onClick={() => checkRemoteStatus(targetIp)}
                        className="touch-press text-[11px] text-theme flex items-center gap-1 hover:underline font-medium"
                        title="刷新连接状态"
                      >
                        <RefreshCw className={`w-3 h-3 ${remoteInfo.checking ? 'animate-spin' : ''}`} />
                        <span>{remoteInfo.checking ? '检测中...' : '刷新状态'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Local device status */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          <Smartphone className="w-3.5 h-3.5 text-theme" />
                          <span>手机端便签数据</span>
                        </div>
                        <div className="text-xs font-mono text-slate-600 dark:text-zinc-400">
                          <span className="font-bold text-slate-900 dark:text-zinc-100">{notes.length}</span> 篇便签 ·{' '}
                          <span className="font-bold text-slate-900 dark:text-zinc-100">{projects.length}</span> 个分类
                        </div>
                      </div>

                      {/* Remote PC device status */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            <Laptop className="w-3.5 h-3.5 text-blue-500" />
                            <span>{remoteInfo.deviceName || '电脑端'}</span>
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              remoteInfo.online
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-500 dark:text-rose-400'
                            }`}
                          >
                            {remoteInfo.checking ? '检测中' : remoteInfo.online ? '在线已连接' : '未连接/离线'}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-600 dark:text-zinc-400">
                          {remoteInfo.online ? (
                            <>
                              <span className="font-bold text-slate-900 dark:text-zinc-100">
                                {remoteInfo.noteCount ?? 0}
                              </span>{' '}
                              篇便签 ·{' '}
                              <span className="font-bold text-slate-900 dark:text-zinc-100">
                                {remoteInfo.projectCount ?? 0}
                              </span>{' '}
                              个分类
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {remoteInfo.message || '请确保手机和电脑连接在同一个 Wi-Fi'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Connect Settings & Big Camera Button */}
                  <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-3.5">
                    {/* Big Scan Button */}
                    <button
                      onClick={startScanner}
                      className="touch-press w-full py-3 px-4 rounded-2xl bg-theme/10 hover:bg-theme/20 text-theme font-semibold text-sm flex items-center justify-center gap-2.5 border-2 border-theme/30 transition-all shadow-xs active:scale-98"
                    >
                      <Camera className="w-5 h-5 stroke-[2.2]" />
                      <span>扫码连接电脑 (扫描电脑屏幕上的二维码)</span>
                    </button>

                    <div className="relative flex items-center py-0.5">
                      <div className="flex-grow border-t border-slate-200 dark:border-zinc-800"></div>
                      <span className="flex-shrink mx-3 text-[10px] text-slate-400 uppercase tracking-wider font-medium">或手动输入连接</span>
                      <div className="flex-grow border-t border-slate-200 dark:border-zinc-800"></div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-1">
                          电脑 IP 地址与端口
                        </label>
                        <input
                          type="text"
                          value={targetIp}
                          onChange={(e) => setTargetIp(e.target.value)}
                          placeholder="例如：192.168.5.13 或 192.168.1.100:25860"
                          className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-theme/30 text-slate-900 dark:text-zinc-100"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-1">
                          配对安全码 (PIN)
                        </label>
                        <input
                          type="text"
                          value={clientPin}
                          onChange={(e) => setClientPin(e.target.value)}
                          placeholder="默认 888888"
                          className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-theme/30 text-slate-900 dark:text-zinc-100"
                        />
                      </div>
                    </div>

                    {/* Sync Mode Selector */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                          选择同步模式
                        </label>
                        <span className="text-[11px] text-theme font-medium">
                          当前：{SYNC_MODES.find((m) => m.id === syncMode)?.name}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {SYNC_MODES.map((m) => {
                          const Icon = m.icon;
                          const isSelected = syncMode === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setSyncMode(m.id)}
                              className={`touch-press p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-1.5 ${
                                isSelected
                                  ? 'border-theme bg-theme/5 shadow-xs ring-1 ring-theme/30'
                                  : 'border-slate-200/80 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/40 hover:border-slate-300 dark:hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5 font-medium text-xs text-slate-900 dark:text-zinc-100">
                                  <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-theme' : 'text-slate-400'}`} />
                                  <span>{m.name}</span>
                                </div>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${m.badgeColor}`}>
                                  {m.badge}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-normal">
                                {m.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      onClick={handleStartSync}
                      disabled={isSyncing}
                      className="touch-press w-full py-3 rounded-xl bg-theme hover:brightness-95 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all disabled:opacity-50 mt-1"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>
                        {isSyncing
                          ? '正在与电脑传输同步中...'
                          : `立即与电脑同步 (${SYNC_MODES.find((m) => m.id === syncMode)?.name})`}
                      </span>
                    </button>
                  </div>

                  {/* Detailed Sync Report Card */}
                  {detailedResult && (
                    <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          本次同步明细报告
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-theme/10 text-theme">
                          {SYNC_MODES.find((m) => m.id === detailedResult.mode)?.name || '智能同步'}
                        </span>
                      </div>

                      {/* Metric Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/60 dark:border-zinc-700/60 text-center">
                          <div className="text-[10px] text-slate-400 dark:text-zinc-500">从电脑拉取</div>
                          <div className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">
                            {detailedResult.pulledNotes} <span className="text-[10px] font-normal">篇</span>
                          </div>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/60 dark:border-zinc-700/60 text-center">
                          <div className="text-[10px] text-slate-400 dark:text-zinc-500">向电脑推送</div>
                          <div className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
                            {detailedResult.pushedNotes} <span className="text-[10px] font-normal">篇</span>
                          </div>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/60 dark:border-zinc-700/60 text-center">
                          <div className="text-[10px] text-slate-400 dark:text-zinc-500">新增便签</div>
                          <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            {detailedResult.newNotesAdded ?? 0} <span className="text-[10px] font-normal">篇</span>
                          </div>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/60 dark:border-zinc-700/60 text-center">
                          <div className="text-[10px] text-slate-400 dark:text-zinc-500">历史版本</div>
                          <div className="text-sm font-bold font-mono text-purple-600 dark:text-purple-400">
                            {detailedResult.historiesSynced ?? 0} <span className="text-[10px] font-normal">条</span>
                          </div>
                        </div>
                      </div>

                      {/* Expandable Change List */}
                      {detailedResult.details && detailedResult.details.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-zinc-800">
                          <button
                            onClick={() => setShowDetailsList(!showDetailsList)}
                            className="touch-press w-full flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 py-1 transition-colors"
                          >
                            <span className="font-medium">
                              变动清单记录 ({detailedResult.details.length} 项)
                            </span>
                            {showDetailsList ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {showDetailsList && (
                            <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                              {detailedResult.details.map(renderDetailItem)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 外部文件夹存储 (External Storage Vault) */}
          {activeTab === 'vault' && (
            <div className="space-y-4">
              {/* Vault Toast */}
              {vaultMessage && (
                <div className="p-3 rounded-xl text-xs bg-theme/10 border border-theme/20 text-theme flex items-center gap-2">
                  <FolderCheck className="w-4 h-4 shrink-0" />
                  <span className="flex-1 break-all leading-relaxed">{vaultMessage}</span>
                </div>
              )}

              {/* Vault Info Card */}
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <FolderOpen className="w-4 h-4 text-theme" />
                    当前外部存储目录
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                    {vaultConfig.enabled ? '已启用外部镜像' : '未开启'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/60 dark:border-zinc-700/60 break-all font-mono text-xs text-slate-800 dark:text-zinc-200">
                  📁 {vaultConfig.folderPath || '未指定外部存储路径'}
                </div>

                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                  每篇便签将自动保存为带有元数据的纯净 <code>.md</code> 文件，图片附件将保存在对应目录中。你可以随时使用 Obsidian、Typora、VS Code 或记事本直接浏览和编辑！
                </p>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    onClick={handlePickVaultFolder}
                    className="touch-press flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-theme" />
                    <span>更换外部存储目录</span>
                  </button>

                  <button
                    onClick={handleFullExportVault}
                    disabled={isExporting}
                    className="touch-press flex-1 py-2 px-3 rounded-xl bg-theme hover:brightness-95 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isExporting ? 'animate-spin' : ''}`} />
                    <span>{isExporting ? '写入中...' : '立即全量备份到该目录'}</span>
                  </button>
                </div>
              </div>

              {/* Automatic Write Setting */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-700/60 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                    便签修改时实时写入外部文件夹
                  </div>
                  <div className="text-[11px] text-slate-400">
                    在应用内新建或编辑保存便签后，自动更新对应的 .md 物理文件
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={vaultConfig.autoExportOnSave}
                  onChange={(e) => {
                    const updated = { ...vaultConfig, autoExportOnSave: e.target.checked };
                    setVaultConfigState(updated);
                    saveVaultConfig(updated);
                  }}
                  className="w-4 h-4 accent-theme rounded cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-zinc-800 flex justify-end">
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="touch-press px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-medium transition-colors"
          >
            关闭
          </button>
        </div>
      </div>

      {/* QR Code Scanner Overlay Viewfinder */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-60 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-700 flex flex-col">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <ScanLine className="w-4 h-4 text-theme animate-pulse" />
                扫描电脑配对二维码
              </span>
              <button
                onClick={stopScanner}
                className="touch-press w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative w-full aspect-square bg-black overflow-hidden flex items-center justify-center">
              {scannerError ? (
                <div className="p-6 text-center space-y-3">
                  <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                  <p className="text-xs text-rose-400 leading-relaxed">{scannerError}</p>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    autoPlay
                    muted
                  />
                  {/* Viewfinder Reticle */}
                  <div className="absolute inset-8 border-2 border-theme/80 rounded-2xl pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                    {/* Animated Scanning Laser Line */}
                    <div className="w-full h-0.5 bg-theme shadow-md shadow-theme animate-bounce" />
                  </div>
                </>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <div className="p-3 bg-zinc-850 text-center space-y-2">
              <p className="text-[11px] text-zinc-400">
                将摄像头对准电脑端「电脑手机互联」界面中显示的二维码
              </p>
              <button
                onClick={stopScanner}
                className="touch-press w-full py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
              >
                取消扫码
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Folder Selection Dialog */}
      {isFolderPickerOpen && (
        <div className="fixed inset-0 z-60 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 p-5 space-y-4 animate-fade-scale">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4 text-theme" />
                选择外部存储文件夹
              </span>
              <button
                onClick={() => setIsFolderPickerOpen(false)}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                常用系统目录预设
              </label>
              <div className="space-y-1">
                {ANDROID_FOLDER_PRESETS.map((p) => (
                  <button
                    key={p.path}
                    onClick={() => setCustomFolderPath(p.path)}
                    className={`touch-press w-full p-2.5 rounded-xl border text-left text-xs font-mono transition-all flex items-center justify-between ${
                      customFolderPath === p.path
                        ? 'border-theme bg-theme/10 text-theme font-semibold'
                        : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    <span>📁 {p.label}</span>
                    {customFolderPath === p.path && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                或自定义存储子路径
              </label>
              <input
                type="text"
                value={customFolderPath}
                onChange={(e) => setCustomFolderPath(e.target.value)}
                placeholder="例如：Documents/ObsidianVault"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-theme/30 text-slate-900 dark:text-zinc-100"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                便签和附件将镜像保存在设备公共存储的此路径下。
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setIsFolderPickerOpen(false)}
                className="touch-press flex-1 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-xs font-medium"
              >
                取消
              </button>
              <button
                onClick={() => handleConfirmMobileFolder(customFolderPath)}
                className="touch-press flex-1 py-2 rounded-xl bg-theme hover:brightness-95 text-white text-xs font-medium"
              >
                确认应用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
