import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  esbuild: {
    tsconfigRaw: "{}",
  },
  test: {
    clearMocks: true,
    globals: true,
    // setupFiles: ["dotenv/config"],q
    coverage: {
      provider: "istanbul", // or 'v8'
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: [{ find: "~", replacement: resolve(__dirname, "src") }],
  },
});