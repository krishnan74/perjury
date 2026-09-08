import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@perjury/tribunal": resolve(__dirname, "packages/tribunal/src/index.ts"),
      "@perjury/ens": resolve(__dirname, "packages/ens/src/index.ts"),
      "@perjury/shared/pinned-deployments.json": resolve(__dirname, "packages/shared/src/pinned-deployments.json"),
      "@perjury/graph-client": resolve(__dirname, "packages/graph-client/src/index.ts"),
      "@perjury/mcp-client": resolve(__dirname, "packages/mcp-client/src/index.ts"),
      "@perjury/llm": resolve(__dirname, "packages/llm/src/index.ts"),
      "@perjury/witness": resolve(__dirname, "agents/witness/src/index.ts"),
      "@perjury/claimant": resolve(__dirname, "agents/claimant/src/index.ts"),
      "@perjury/panel": resolve(__dirname, "agents/panel/src/index.ts"),
      "@perjury/gateway": resolve(__dirname, "packages/gateway/src/index.ts"),
      "@perjury/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@perjury/graph-guard": resolve(__dirname, "packages/graph-guard/src/index.ts"),
    },
  },
  test: { include: ["packages/**/test/**/*.test.ts", "agents/**/test/**/*.test.ts"] },
});
