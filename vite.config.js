import { defineConfig } from 'vite';

// Build que se puede abrir con doble clic (file://): rutas relativas y script clásico,
// porque los <script type="module"> no cargan desde file:// en Chrome.
export default defineConfig({
  base: './',
  build: {
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
  plugins: [{
    name: 'classic-script-for-file-protocol',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace(/<script type="module" crossorigin/g, '<script defer'),
    },
  }],
});
