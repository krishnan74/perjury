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

// ── Block-pinned reads ──────────────────────────────────────────────────────
// Both parties must read one agreed block, so the argument is injected by us
// rather than trusted to the agent's own composed query.
describe("composeDocument with a pinned block", () => {
  it("adds the block argument to a field that already has arguments", () => {
    const doc = composeDocument("lendingProtocols(first: 1) { id name }", 123);
    expect(doc).toContain("lendingProtocols(first: 1, block: {number: 123})");
  });

  it("adds an argument list to a field that has none", () => {
    const doc = composeDocument("lendingProtocols { id }", 456);
    expect(doc).toContain("lendingProtocols(block: {number: 456})");
  });

  it("pins _meta too, so provenance reports the pinned block", () => {
    const doc = composeDocument("lendingProtocols { id }", 789);
    expect(doc).toContain("_meta(block: {number: 789})");
  });

  it("touches only the root field, never a nested selection", () => {
    const doc = composeDocument("lendingProtocols { markets { id } }", 42);
    expect(doc).toContain("lendingProtocols(block: {number: 42})");
    expect(doc).not.toContain("markets(block");
  });

  it("is unchanged when no block is pinned", () => {
    expect(composeDocument("lendingProtocols { id }")).not.toContain("block: {number");
  });
});
