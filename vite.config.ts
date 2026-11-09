import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // 使用相对路径，保证 Electron 通过 file:// 加载 dist/index.html 时资源也能正确解析
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173
  }
});
