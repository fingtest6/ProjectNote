/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // Tailwind 默认 z-index 只到 z-50，项目里的 z-60（同步报告、图片预览）
      // 与 z-70（同步确认弹窗）需要显式扩展，否则这些弹窗没有层级，
      // 会被 z-50 的同步中心弹窗整层盖住。
      zIndex: {
        60: '60',
        70: '70',
        80: '80',
      },
      colors: {
        theme: {
          DEFAULT: 'var(--theme-primary)',
          hover: 'var(--theme-hover)',
          soft: 'var(--theme-soft)',
          ring: 'var(--theme-ring)',
        }
      }
    },
  },
  plugins: [],
}
