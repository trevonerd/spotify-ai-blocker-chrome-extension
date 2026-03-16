import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      input: {
        // Ensure the page script is compiled into a JS asset we can inject.
        "page-script": "src/page-script.ts",
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "page-script") {
            return "assets/page-script.js";
          }
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
    },
  },
});
