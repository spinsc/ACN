import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      // Suporte a iOS 10+ / Safari 10+ (iPad 4ª gen)
      targets: ['ios >= 10', 'safari >= 10'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      // safari10: true → workaround p/ bug do Safari 10 que executava
      // scripts "nomodule" E "type=module" ao mesmo tempo.
      safari10: true,
      // renderModernChunks: true (padrão) — mantemos AMBOS os bundles:
      //   • bundle moderno (type=module) → Safari 10+ usa este, com ES2015 via build.target
      //   • bundle legacy  (nomodule)   → browsers antigos sem ES modules
      // NÃO usar renderModernChunks:false porque iOS 10 Safari detecta "module"
      // e IGNORA scripts nomodule — resultado: página em branco sem erros.
    }),
  ],
  base: '/ACN/',
  build: {
    // target es2015 faz o esbuild compilar TODA a sintaxe moderna
    // (optional chaining ?., nullish coalescing ??, private fields #x, etc.)
    // para ES2015 — inclusive de dentro de node_modules (Supabase, React, etc.)
    // Isso garante que o bundle moderno rode no Safari 10 / iOS 10.
    target: 'es2015',
  },
})
