const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const SYNC_PORT = 25860;
let currentPin = '888888';

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

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ready',
        deviceName: `${os.hostname()} (Windows 电脑端服务)`,
        ips: getLocalIpv4Addresses(),
        port: SYNC_PORT,
        pinRequired: true,
      })
    );
    return;
  }

  const vaultPath = path.join(__dirname, '../.sync_vault_cache.json');

  if (req.url === '/api/status' && req.method === 'GET') {
    let noteCount = 0;
    let projectCount = 0;
    if (fs.existsSync(vaultPath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(vaultPath, 'utf-8'));
        noteCount = (cached.notes || []).length;
        projectCount = (cached.projects || []).length;
      } catch {}
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ready',
        deviceName: `${os.hostname()} (Windows 电脑端服务)`,
        ips: getLocalIpv4Addresses(),
        port: SYNC_PORT,
        pinRequired: true,
        noteCount,
        projectCount,
      })
    );
    return;
  }

  if (req.url === '/api/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (parsed.pin !== currentPin) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: '配对码错误，请核对电脑端显示的 6 位配对码！' }));
          return;
        }

        let serverData = { projects: [], notes: [], histories: [] };
        if (fs.existsSync(vaultPath)) {
          try {
            serverData = JSON.parse(fs.readFileSync(vaultPath, 'utf-8'));
          } catch {}
        }

        const clientData = parsed.payload;
        const mode = parsed.mode || 'smart-merge';

        let finalMerged;

        if (mode === 'push-overwrite') {
          // Client completely overwrites server
          finalMerged = {
            deviceId: clientData.deviceId || `${os.hostname()}-server`,
            deviceName: `${os.hostname()} (电脑服务)`,
            timestamp: Date.now(),
            projects: clientData.projects || [],
            notes: clientData.notes || [],
            histories: clientData.histories || [],
          };
        } else if (mode === 'pull-overwrite') {
          // Client wants server's exact data, server doesn't change
          finalMerged = serverData;
        } else if (mode === 'new-only') {
          // Only add new items
          const serverNoteIds = new Set((serverData.notes || []).map((n) => n.id));
          const newNotesFromClient = (clientData.notes || []).filter((n) => !serverNoteIds.has(n.id));

          const serverProjIds = new Set((serverData.projects || []).map((p) => p.id));
          const newProjsFromClient = (clientData.projects || []).filter((p) => !serverProjIds.has(p.id));

          finalMerged = {
            projects: [...(serverData.projects || []), ...newProjsFromClient],
            notes: [...(serverData.notes || []), ...newNotesFromClient],
            histories: [...(serverData.histories || []), ...(clientData.histories || [])],
          };
        } else {
          // smart-merge
          const mergedNoteMap = new Map();
          (serverData.notes || []).forEach((n) => mergedNoteMap.set(n.id, n));
          (clientData.notes || []).forEach((n) => {
            const existing = mergedNoteMap.get(n.id);
            if (!existing || n.updatedAt > existing.updatedAt) {
              mergedNoteMap.set(n.id, n);
            }
          });

          const mergedProjMap = new Map();
          (serverData.projects || []).forEach((p) => mergedProjMap.set(p.id, p));
          (clientData.projects || []).forEach((p) => {
            const existing = mergedProjMap.get(p.id);
            if (!existing || p.updatedAt > existing.updatedAt) {
              mergedProjMap.set(p.id, p);
            }
          });

          finalMerged = {
            projects: Array.from(mergedProjMap.values()),
            notes: Array.from(mergedNoteMap.values()),
            histories: [...(serverData.histories || []), ...(clientData.histories || [])],
          };
        }

        fs.writeFileSync(vaultPath, JSON.stringify(finalMerged, null, 2), 'utf-8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, payload: finalMerged }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(SYNC_PORT, '0.0.0.0', () => {
  console.log(`[LAN Sync Server] Running on http://0.0.0.0:${SYNC_PORT}`);
  console.log(`[LAN IPs]:`, getLocalIpv4Addresses().join(', '));
});
