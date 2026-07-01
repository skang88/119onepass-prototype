import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 로컬 네트워크에 노출 (--host)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000', // localhost 대신 127.0.0.1 명시 (Node.js IPv6 해소용)
        changeOrigin: true,
      },
      '/backend': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend/, '')
      }
    }
  }
})

