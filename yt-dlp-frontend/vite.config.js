import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Build straight into the backend's static dir so `npm start` serves the
    // freshly built SPA with no copy step. Resolved relative to this config file.
    outDir: '../yt-dlp-backend/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
      '/downloads': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
})
