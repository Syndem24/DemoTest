import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/room-management/',
  build: {
    outDir: '../wwwroot/room-management',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'room-app.js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'room-app.[ext]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5288',
      '/Rooms': 'http://localhost:5288',
    },
  },
})
