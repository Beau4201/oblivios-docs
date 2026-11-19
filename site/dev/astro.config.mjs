import { defineConfig, passthroughImageService } from "astro/config";

export default defineConfig({
  site: "https://oblivios.dev",
  output: "static",
  trailingSlash: "never",
  // one file per page (/components is served from components.html by cleanUrls); no inline stylesheet, because the
  // Content-Security-Policy is default-src 'self'
  build: { format: "file", inlineStylesheets: "never" },
  compressHTML: true,
  devToolbar: { enabled: false },
  image: { service: passthroughImageService() },
  // the logo, icons, paper and stamp are the shared files of oblivios.org
  publicDir: "../shared/public",
  vite: { build: { assetsInlineLimit: 0 } },
});
