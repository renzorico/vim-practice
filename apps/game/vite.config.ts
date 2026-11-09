import react from '@vitejs/plugin-react';

// Plain object instead of defineConfig: the root workspace's vitest bundles its own vite copy, and mixing
// the two copies' types breaks `tsc` under exactOptionalPropertyTypes.
export default {
  // Relative base so the build works under a GitHub Pages sub-path.
  base: './',
  plugins: [react()],
};
