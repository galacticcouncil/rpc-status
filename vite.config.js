import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // Adjust server configuration as needed
  server: {
    fs: {
      // Allow serving files from the project root
      allow: ['..'],
    },
  },
});
