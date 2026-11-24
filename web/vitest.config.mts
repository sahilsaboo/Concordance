import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    // Pure logic tests run in Node; component tests opt into a browser-like DOM per file.
    environment: "node",
  },
});
