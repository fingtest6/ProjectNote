const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

let mainWindow = null;
let syncServer = null;
let currentPin = '888888';
const SYNC_PORT = 25860;
const pendingSyncRequests = new Map();
let syncRequestId = 0;
const connectedMobileClients = new Map(); // deviceId -> { deviceName, lastSeen, res }
const pendingDeviceTasks = new Map(); // deviceId -> task
const pendingInvites = new Map(); // deviceId -> { mode, expiresAt } 电脑端已主动邀请过的设备
const INVITE_TTL_MS = 2 * 60 * 1000;

// Get local network IPv4 addresses with smart LAN prioritization (192.168.x.x > 10.x.x.x > virtual adapters)
function getLocalIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const list = [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    const isVirtual =
      lowerName.includes('wsl') ||
      lowerName.includes('vethernet') ||
      lowerName.includes('virtual') ||
      lowerName.includes('vmware') ||
      lowerName.includes('docker');

    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        list.push({ address: iface.address, isVirtual });
      }
    }
  }

  // Prioritize physical Wi-Fi/LAN (192.168.x.x and 10.x.x.x) over WSL/virtual adapters
  list.sort((a, b) => {
    const scoreA = a.address.startsWith('192.168.') ? 10 : a.address.startsWith('10.') ? 8 : a.isVirtual ? 1 : 5;
    const scoreB = b.address.startsWith('192.168.') ? 10 : b.address.startsWith('10.') ? 8 : b.isVirtual ? 1 : 5;
    return scoreB - scoreA;
  });

  return list.map((item) => item.address);
}

// Start built-in LAN sync server
function startLanSyncServer() {
  if (syncServer) return;

  syncServer = http.createServer(async (req, res) => {
    // Enable CORS for mobile app fetch
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url.startsWith('/api/status') && req.method === 'GET') {
      try {
        const u = new URL(req.url, 'http://localhost');
        const dId = u.searchParams.get('deviceId');
        const dName = decodeURIComponent(u.searchParams.get('deviceName') || '');
        if (dId) {
          const existing = connectedMobileClients.get(dId);
          connectedMobileClients.set(dId, {
            deviceId: dId,
            deviceName: dName || existing?.deviceName || '移动设备',
            lastSeen: Date.now(),
            res: existing?.res,
          });
        }
      } catch (e) {}

      let counts = { noteCount: 0, projectCount: 0 };
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          const reqId = ++syncRequestId;
          const countPromise = new Promise((resolve) => {
            pendingSyncRequests.set(reqId, resolve);
            setTimeout(() => {
              if (pendingSyncRequests.has(reqId)) {
                pendingSyncRequests.delete(reqId);
                resolve({ noteCount: 0, projectCount: 0 });
              }
            }, 3000);
          });
          mainWindow.webContents.send('sync:get-counts-request', { id: reqId });
          counts = await countPromise;
        } catch (e) {}
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ready',
          deviceName: `${os.hostname()} (Windows 电脑端)`,
          ips: getLocalIpv4Addresses(),
          port: SYNC_PORT,
          pinRequired: true,
          noteCount: (counts && counts.noteCount) || 0,
          projectCount: (counts && counts.projectCount) || 0,
        })
      );
      return;
    }

    // Mobile client polling for tasks from PC
    if (req.url.startsWith('/api/device/poll') && req.method === 'GET') {
      try {
        const u = new URL(req.url, 'http://localhost');
        const deviceId = u.searchParams.get('deviceId') || 'unknown';
        const deviceName = decodeURIComponent(u.searchParams.get('deviceName') || '移动设备');

        if (pendingDeviceTasks.has(deviceId)) {
          const task = pendingDeviceTasks.get(deviceId);
          pendingDeviceTasks.delete(deviceId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasTask: true, task }));
          return;
        }

        connectedMobileClients.set(deviceId, {
          deviceId,
          deviceName,
          lastSeen: Date.now(),
          res,
        });

        req.on('close', () => {
          if (connectedMobileClients.get(deviceId)?.res === res) {
            connectedMobileClients.delete(deviceId);
          }
        });

        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ hasTask: false }));
          }
        }, 20000);
        return;
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
        return;
      }
    }

    // List connected mobile devices
    if (req.url === '/api/device/list' && req.method === 'GET') {
      const now = Date.now();
      const list = [];
      for (const [dId, info] of connectedMobileClients.entries()) {
        if (now - info.lastSeen < 60000) {
          list.push({ deviceId: dId, deviceName: info.deviceName });
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ devices: list }));
      return;
    }

    if (req.url === '/api/sync' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.pin !== currentPin) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: '配对码错误，请核对电脑端显示的 6 位配对码！' }));
            return;
          }

          let responseObj = null;
          const reqId = ++syncRequestId;
          const fromDeviceId = parsed.from?.deviceId || parsed.payload?.deviceId || 'unknown';

          // 只有当电脑端刚刚主动邀请过这台设备时，才把它视为「对邀请的确认」；
          // 其余情况一律交给用户弹窗确认，避免任意局域网设备静默完成同步。
          const invite = pendingInvites.get(fromDeviceId);
          const isReplyToInvite =
            Boolean(parsed.from?.isReplyToInvite) && Boolean(invite) && invite.expiresAt > Date.now();
          if (isReplyToInvite) {
            pendingInvites.delete(fromDeviceId);
          }

          if (mainWindow && !mainWindow.isDestroyed()) {
            const syncPromise = new Promise((resolve) => {
              pendingSyncRequests.set(reqId, resolve);
              // Allow 45s for the user to view and click the confirmation prompt
              setTimeout(() => {
                if (pendingSyncRequests.has(reqId)) {
                  pendingSyncRequests.delete(reqId);
                  resolve(null);
                }
              }, 45000);
            });

            // 把窗口拉到前台并闪烁任务栏，确保电脑端用户能注意到确认请求
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.flashFrame(true);

            mainWindow.webContents.send('sync:incoming-request', {
              id: reqId,
              from: {
                deviceId: fromDeviceId,
                deviceName: parsed.from?.deviceName || parsed.payload?.deviceName || '移动端设备',
                isReplyToInvite,
              },
              mode: parsed.mode || 'smart-merge',
              summary: parsed.summary || {
                noteCount: (parsed.payload?.notes || []).length,
                projectCount: (parsed.payload?.projects || []).length,
              },
              payload: parsed.payload,
            });

            responseObj = await syncPromise;
          }

          if (responseObj && responseObj.accepted === false) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              accepted: false,
              message: responseObj.reason || '电脑端用户拒绝了本次同步请求',
            }));
            return;
          }

          if (responseObj && responseObj.accepted === true) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              accepted: true,
              payload: responseObj.result,
              stats: responseObj.result?.stats,
            }));
            return;
          }

          if (!responseObj) {
            // Timeout or window unavailable
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              accepted: false,
              message: '电脑端未在 45 秒内点击确认允许同步',
            }));
            return;
          }
        } catch (err) {
          console.error('Sync server error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  syncServer.on('error', (err) => {
    console.log('[LAN Sync Server Notice]', err.message);
  });

  syncServer.listen(SYNC_PORT, '0.0.0.0', () => {
    console.log(`[LAN Sync Server] Listening on 0.0.0.0:${SYNC_PORT}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    title: '项目便签 - Windows 桌面版',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 优先使用 Vite 开发服务器（带 HMR）；未启动时回退到 dist 构建产物
  const devUrl = 'http://localhost:5173';
  const distHtml = path.join(__dirname, '../dist/index.html');

  let pageLoadRequested = false;

  const loadBuiltApp = () => {
    if (pageLoadRequested) return;
    pageLoadRequested = true;
    if (fs.existsSync(distHtml)) {
      console.log('[Electron] 未检测到 Vite 开发服务器，加载 dist 构建产物');
      mainWindow.loadFile(distHtml);
    } else {
      console.warn('[Electron] 未找到 dist/index.html，尝试直接连接开发服务器');
      mainWindow.loadURL(devUrl);
    }
  };

  const loadDevServer = () => {
    if (pageLoadRequested) return;
    pageLoadRequested = true;
    console.log('[Electron] 已连接 Vite 开发服务器:', devUrl);
    mainWindow.loadURL(devUrl);
  };

  const probe = http.get(devUrl, (res) => {
    res.resume();
    if (res.statusCode && res.statusCode >= 400) {
      loadBuiltApp();
    } else {
      loadDevServer();
    }
  });
  probe.setTimeout(1500, () => {
    probe.destroy();
    loadBuiltApp();
  });
  probe.on('error', loadBuiltApp);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Electron] 页面加载失败:', errorCode, errorDescription, validatedURL);
    // 开发服务器中途不可用时，自动回退到已构建的 dist，避免出现黑屏
    if (validatedURL.startsWith(devUrl) && fs.existsSync(distHtml)) {
      mainWindow.loadFile(distHtml);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron] 渲染进程异常退出:', details.reason);
  });

  // Remove default menu for a clean app feel
  mainWindow.setMenuBarVisibility(false);

  startLanSyncServer();
}

app.whenReady().then(() => {
  // IPC: Directory Picker
  ipcMain.handle('vault:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择外部存储笔记文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // IPC: Write file to vault
  ipcMain.handle('vault:write-file', async (_event, { folderPath, projectDir, filename, content }) => {
    const targetDir = path.join(folderPath, projectDir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const filePath = path.join(targetDir, filename);
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  });

  // IPC: Delete file from vault
  ipcMain.handle('vault:delete-file', async (_event, { folderPath, projectDir, filename }) => {
    const filePath = path.join(folderPath, projectDir, filename);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  });

  // IPC: Sync info
  ipcMain.handle('sync:get-server-info', async () => {
    return {
      ips: getLocalIpv4Addresses(),
      port: SYNC_PORT,
      pin: currentPin,
    };
  });

  // IPC: Update PIN
  ipcMain.handle('sync:set-pin', async (_event, newPin) => {
    currentPin = String(newPin);
    return currentPin;
  });

  // IPC: Respond to incoming sync/status request from renderer
  ipcMain.on('sync:response', (_event, { id, accepted, result, reason }) => {
    const resolve = pendingSyncRequests.get(id);
    if (resolve) {
      pendingSyncRequests.delete(id);
      resolve({ accepted, result, reason });
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.flashFrame(false);
    }
  });

  // IPC: Get connected mobile devices
  ipcMain.handle('sync:get-connected-devices', () => {
    const now = Date.now();
    const list = [];
    for (const [dId, info] of connectedMobileClients.entries()) {
      if (now - info.lastSeen < 60000) {
        list.push({ deviceId: dId, deviceName: info.deviceName });
      }
    }
    return list;
  });

  // IPC: Trigger sync task to connected mobile client
  ipcMain.handle('sync:trigger-mobile-sync', (_event, { deviceId, mode, noteCount, projectCount }) => {
    const task = {
      type: 'sync-invitation',
      mode: mode || 'smart-merge',
      from: `${os.hostname()} (Windows 电脑端)`,
      noteCount: Number(noteCount) || 0,
      projectCount: Number(projectCount) || 0,
      timestamp: Date.now(),
    };

    if (deviceId) {
      // 记录邀请，手机端确认后回连时才允许免二次确认
      pendingInvites.set(deviceId, { mode: task.mode, expiresAt: Date.now() + INVITE_TTL_MS });
      const client = connectedMobileClients.get(deviceId);
      if (client && client.res && !client.res.writableEnded) {
        client.res.writeHead(200, { 'Content-Type': 'application/json' });
        client.res.end(JSON.stringify({ hasTask: true, task }));
        connectedMobileClients.delete(deviceId);
        return true;
      }
      pendingDeviceTasks.set(deviceId, task);
      return true;
    }

    let sent = false;
    for (const [dId, client] of connectedMobileClients.entries()) {
      if (client.res && !client.res.writableEnded) {
        pendingInvites.set(dId, { mode: task.mode, expiresAt: Date.now() + INVITE_TTL_MS });
        client.res.writeHead(200, { 'Content-Type': 'application/json' });
        client.res.end(JSON.stringify({ hasTask: true, task }));
        connectedMobileClients.delete(dId);
        sent = true;
      }
    }
    return sent;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (syncServer) {
    syncServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
