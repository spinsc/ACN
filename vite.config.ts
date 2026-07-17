import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      // Suporte a iOS 10+ / Safari 10+ (iPad 4ª gen, iPhone 5s etc.)
      targets: ['ios >= 10', 'safari >= 10', 'chrome >= 49'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      // Desativa o bundle moderno — todos os browsers recebem o bundle
      // transpilado (ES5). Evita que iOS 10 execute sintaxe moderna por engano.
      renderModernChunks: false,
      // Polyfills também para APIs de runtime (Promise.allSettled, etc.)
      modernPolyfills: true,
    }),
  ],
  base: '/ACN/',
  build: {
    // Garante que o Vite não emite sintaxe mais nova que ES2015 antes do Babel
    target: 'es2015',
    // Terser minifica corretamente o bundle legacy
    minify: 'terser',
  },
})
