import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // adapter-node is used for Express integration
    adapter: adapter({
      out: 'build',
      precompress: false,
      envPrefix: 'APP_',
    }),

    // Alias for easier imports (optional)
    alias: {
      $components: 'src/lib/components',
      $utils: 'src/lib/utils',
    },
  },
};

export default config;
