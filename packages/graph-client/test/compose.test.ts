// Query composition. _meta must be a root field; an LLM composing a whole
// document nests it inside the entity selection, which is a GraphQL error.
import { describe, expect, it } from "vitest";
import { composeDocument } from "@perjury/graph-client";

describe("composeDocument", () => {
  it("adds root _meta to a bare selection", () => {
    expect(composeDocument("lendingProtocols { id }")).toContain("_meta { deployment");
    expect(composeDocument("lendingProtocols { id }")).toContain("lendingProtocols { id }");
  });

  it("strips a nested _meta the caller wrongly included", () => {
    const out = composeDocument("lendingProtocols { id _meta { deployment } }");
    // exactly one _meta, and it is at the root
    expect(out.match(/_meta/g)?.length).toBe(1);
    expect(out.indexOf("_meta")).toBeLessThan(out.indexOf("lendingProtocols"));
  });

  it("unwraps a full document", () => {
    expect(composeDocument("{ lendingProtocols { id } }")).toContain("lendingProtocols { id }");
  });
});
