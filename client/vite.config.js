// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgrPlugin from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [react(), svgrPlugin()],
  server: {
    host: '0.0.0.0',
    port: 4000
  },
  build: {
    outDir: 'build',
  } 
})