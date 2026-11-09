const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const electronExePath = path.join(__dirname, '../node_modules/electron/dist/electron.exe');
const nativeExePath = path.join(__dirname, '../项目便签.exe');

if (fs.existsSync(electronExePath)) {
  // If Electron binary is installed, launch standard Electron
  console.log('🚀 正在启动 Electron 桌面版...');
  const child = spawn(electronExePath, [path.join(__dirname, '../electron/main.cjs')], {
    stdio: 'inherit',
    windowsHide: false,
  });
  child.on('exit', (code) => process.exit(code || 0));
} else {
  // If Electron binary download was blocked by network, launch the native Windows executable
  console.log('------------------------------------------------------------');
  console.log('ℹ️  提示：检测到当前网络未能从 GitHub 下载 Electron 预编译包（~100MB）。');
  console.log('💡 已自动为您无缝切换至 Windows 原生桌面版应用（项目便签.exe）！');
  console.log('------------------------------------------------------------\n');

  if (fs.existsSync(nativeExePath)) {
    const child = spawn(nativeExePath, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log('✅ 项目便签 Windows 桌面版已成功唤起！');
  } else {
    // Fallback: start msedge directly
    console.log('🚀 正在以独立应用窗口模式启动...');
    try {
      execSync('start msedge --app=http://localhost:5173/ --window-size=1200,800', { shell: 'cmd.exe' });
    } catch {
      execSync('start http://localhost:5173/', { shell: 'cmd.exe' });
    }
  }
}
