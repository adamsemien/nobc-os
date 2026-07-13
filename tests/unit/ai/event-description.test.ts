import { describe, it, expect, vi, beforeEach } from "vitest";

// The shared description generator's output-cleaning pipeline: model text is
// not member-facing copy until it is unwrapped (preamble, quotes), stripped
// of trailing metadata, and brand-punctuated. Both callers (the compose
// describer and the Generate with AI button) inherit this.

const m = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText: m.generateText }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => "mock-model" }));

import { generateEventDescription } from "@/lib/ai/event-description";

const respond = (text: string) => m.generateText.mockResolvedValue({ text });

beforeEach(() => m.generateText.mockReset());

describe("generateEventDescription - clean prose only", () => {
  it("scrubs the observed live pollution: preamble, em dash, metadata block, ISO", async () => {
    respond(
      "Here is the description: Sunday dinner at the loft, beginning at 7 in the evening. A $25 seat at the table — the kind of night that settles into conversation and stays there. Doors are open to members. --- **Resolved datetime:** 2026-07-12T19:00:00-05:00",
    );
    const out = await generateEventDescription("facts");
    expect(out).toBe(
      "Sunday dinner at the loft, beginning at 7 in the evening. A $25 seat at the table - the kind of night that settles into conversation and stays there. Doors are open to members.",
    );
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(out).not.toMatch(/here is the description/i);
    expect(out).not.toContain("---");
  });

  it("unwraps a quoted answer and a bare 'Description:' prefix", async () => {
    respond('Description: "A slow night on the terrace."');
    expect(await generateEventDescription("facts")).toBe("A slow night on the terrace.");
  });

  it("passes clean prose through untouched", async () => {
    respond("Long tables, low light, no hurry.");
    expect(await generateEventDescription("facts")).toBe("Long tables, low light, no hurry.");
  });

  it("returns empty for a metadata-only answer so callers can degrade", async () => {
    respond("--- **Resolved datetime:** 2026-07-12T19:00:00-05:00");
    expect(await generateEventDescription("facts")).toBe("");
  });
});
