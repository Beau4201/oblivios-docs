import fs from "node:fs";
import path from "node:path";
import { defineConfig, passthroughImageService } from "astro/config";

// The review build (REVIEW=1) adds the click-to-flag layer for the owner's read of the served pages. It is
// never part of the production output: it uses local storage, which the site otherwise never does.
const review = process.env.REVIEW === "1";
const reviewLayer = {
  name: "review-layer",
  hooks: {
    "astro:build:done": ({ dir }) => {
      fs.copyFileSync(path.resolve("../shared/review/review.js"), path.join(dir.pathname, "review.js"));
    },
  },
};

export default defineConfig({
  site: "https://oblivios.org",
  output: "static",
  trailingSlash: "never",
  // one file per page (/security is served from security.html by cleanUrls); no inline stylesheet, because the
  // Content-Security-Policy is default-src 'self'
  build: { format: "file", inlineStylesheets: "never" },
  compressHTML: true,
  devToolbar: { enabled: false },
  image: { service: passthroughImageService() },
  publicDir: "../shared/public",
  // no asset is inlined as a data: URI (same reason)
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: review ? [reviewLayer] : [],
});
