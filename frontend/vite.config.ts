import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  // In production, use the environment variable; in dev, use the proxy
  const apiUrl = command === 'serve' 
    ? '' 
    : (env.VITE_API_URL || 'https://nova-notes-1.onrender.com')
  
  const apiProxy = env.VITE_API_PROXY || 'http://localhost:8001'

  return {
    define: {
      __API_URL__: JSON.stringify(apiUrl),
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxy,
          changeOrigin: true,
        },
      },
    },
  }
})
