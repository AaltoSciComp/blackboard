// vite.config.js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import svgrPlugin from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [react(), svgrPlugin()],
  server: {
    host: '0.0.0.0',
    port: 4000
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.test.{js,jsx}'],
  },
  build: {
    outDir: 'build',
  } 
})