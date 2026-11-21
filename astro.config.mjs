// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // SSR: la API key y los tokens solo viven en el servidor (funciones de Vercel)
  output: 'server',
  adapter: vercel(),

  vite: {
    plugins: [tailwindcss()],
  },
});
