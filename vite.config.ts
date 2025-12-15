import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Configuration explicite pour s'assurer que les assets du dossier public sont copiés
  publicDir: 'public',
  build: {
    // S'assurer que les assets statiques sont bien copiés
    copyPublicDir: true,
    // Augmenter la limite de taille pour les gros assets (textures, meshes)
    chunkSizeWarningLimit: 1000,
  },
})
