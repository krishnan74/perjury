// Subgraph MCP client. See docs/design.md §5.2.
//
// The witness agent reaches The Graph through these tools rather than a
// hardcoded query: it searches for a subgraph, inspects the schema, and composes
// its own GraphQL. That distinction is what makes this an AI use case rather
// than a cron job with a query string in it.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export const SUBGRAPH_MCP_URL = "https://subgraphs.mcp.thegraph.com/sse";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export async function connectSubgraphMcp(apiKey: string = process.env.GRAPH_STUDIO_KEY ?? "") {
  if (!apiKey) throw new Error("GRAPH_STUDIO_KEY unset — Subgraph MCP requires a Gateway key");

  const transport = new SSEClientTransport(new URL(SUBGRAPH_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    eventSourceInit: {
      fetch: (url, init) =>
        fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${apiKey}` } }),
    },
  });

  const client = new Client({ name: "perjury-witness", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);

  return {
    client,
    async tools(): Promise<McpTool[]> {
      const res = await client.listTools();
      return res.tools as McpTool[];
    },
    async call(name: string, args: Record<string, unknown>) {
      return client.callTool({ name, arguments: args });
    },
    async close() {
      await client.close();
    },
  };
}
