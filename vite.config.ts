import { defineConfig } from 'vite'

// The library: one ES module, three.js stays a peer dependency.
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'agentopolis.js' },
    rollupOptions: { external: [/^three/] },
    sourcemap: true,
    emptyOutDir: true,
  },
})
