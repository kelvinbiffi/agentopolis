import { defineConfig } from 'vite'

// The demo site (GitHub Pages): the assets folder is served as /assets.
export default defineConfig({
  root: 'demo',
  base: './',
  publicDir: '../public-demo',
  build: { outDir: '../demo-dist', emptyOutDir: true },
  server: { fs: { allow: ['..'] } },
})
