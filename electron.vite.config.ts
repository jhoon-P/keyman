import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  const define = { __LOCAL_COLLECTION__: 'false' }
  return {
    main: {
      define,
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          external: ['playwright', 'playwright-core']
        }
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()]
    },
    renderer: {
      define,
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src')
        }
      },
      plugins: [react()]
    }
  }
})
