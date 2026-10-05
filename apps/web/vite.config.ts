/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// MEND_DEMO=1 builds the keyless demo that scripts/build-demo.mjs folds
// into one HTML file: no service worker, and every asset (fonts, worklet)
// inlined so the page needs nothing but itself.
const demo = process.env.MEND_DEMO === "1";

// https://vite.dev/config/
export default defineConfig({
  build: demo ? { assetsInlineLimit: 100_000_000, cssCodeSplit: false } : {},
  plugins: [
    react(),
    tailwindcss(),
    ...(demo ? [] : [VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Kese AI",
        short_name: "Kese AI",
        description: "Show it. Ask how. Kese AI talks you through the fix.",
        theme_color: "#0e0d0b",
        background_color: "#0e0d0b",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [],
      },
      workbox: {
        // The live screen is camera/mic/network-dependent and should
        // never be served stale from a cache; only the app shell is
        // precached so "Add to Home Screen" launches instantly.
        navigateFallbackDenylist: [/^\/api\//],
      },
    })]),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
