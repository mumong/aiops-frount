import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const DEFAULT_PROXY_TARGET = 'http://10.2.0.48:30800'

// Split stable vendor code out of the app chunk so it caches independently.
const VENDOR_CHUNKS: Array<[name: string, pattern: RegExp]> = [
  ['vendor-react', /\/node_modules\/(react|react-dom|scheduler)\//],
  ['vendor-antd', /\/node_modules\/(antd|@ant-design|@rc-component|rc-[^/]+|@emotion|stylis|dayjs)\//],
  ['vendor-markdown', /\/node_modules\/(highlight\.js|react-markdown|remark-[^/]+|micromark[^/]*|mdast-[^/]+|hast-[^/]+|unist-[^/]+|unified|vfile[^/]*)\//],
]

export default defineConfig(({ mode }) => {
  // VITE_PROXY_TARGET may come from the shell or a .env file.
  const proxyTarget = loadEnv(mode, '.', 'VITE_').VITE_PROXY_TARGET || DEFAULT_PROXY_TARGET
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replace(/\\/g, '/')
            return VENDOR_CHUNKS.find(([, pattern]) => pattern.test(normalized))?.[0]
          },
        },
      },
    },
  }
})
