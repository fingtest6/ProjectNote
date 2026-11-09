@echo off
chcp 65001 >nul
title 项目便签 - Windows 桌面启动器

echo ===================================================
echo        🚀 正在启动 项目便签 Windows 桌面版...
echo ===================================================

cd /d "%~dp0"

:: 检查并启动局域网互联同步服务与Web服务
start /b "" node scripts/sync-server.cjs
start /b "" pnpm run dev

:: 等待服务启动
timeout /t 2 /nobreak >nul

:: 使用 Windows 独立无边框应用模式打开（无多余标签页、地址栏，独立任务栏图标）
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:5173/ --window-size=1200,800
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:5173/ --window-size=1200,800
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173/ --window-size=1200,800
) else (
    start "" http://localhost:5173/
)

echo.
echo ✅ 项目便签桌面版已启动！
echo 电脑端局域网互联服务运行于端口 25860
echo.
