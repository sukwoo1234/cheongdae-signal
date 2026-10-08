import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Next keeps JSX for its own compiler; component tests need an executable transform.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
