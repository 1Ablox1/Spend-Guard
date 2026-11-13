import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages: https://1ablox1.github.io/Spend-Guard/
  base: '/Spend-Guard/',
})
