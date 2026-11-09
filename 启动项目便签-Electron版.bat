@echo off
chcp 65001 >nul
title 项目便签 - Electron 桌面版

cd /d "%~dp0"
echo ========================================================
echo        🚀 正在启动 项目便签 Electron 桌面版...
echo ========================================================

start "" "node_modules\electron\dist\electron.exe" "electron\main.cjs"
