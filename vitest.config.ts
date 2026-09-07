import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@perjury/tribunal": resolve(__dirname, "packages/tribunal/src/index.ts"),
      "@perjury/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@perjury/graph-guard": resolve(__dirname, "packages/graph-guard/src/index.ts"),
    },
  },
  test: { include: ["packages/**/test/**/*.test.ts", "agents/**/test/**/*.test.ts"] },
});
