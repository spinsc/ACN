import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      // Suporte a iOS 10+ / Safari 10+ (iPad 4ª gen, iPhone 5s etc.)
      targets: ['ios >= 10', 'safari >= 10'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  base: '/ACN/',
})
