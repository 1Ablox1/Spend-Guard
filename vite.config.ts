import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Root path for Vercel / any static host. Use '/Spend-Guard/' only for GitHub project Pages.
  base: '/',
})
