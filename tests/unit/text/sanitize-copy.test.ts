import { describe, it, expect } from "vitest";
import { toBrandPunctuation } from "@/lib/text/sanitize-copy";

// Brand punctuation law: spaced hyphens, never em dashes. Pure, idempotent,
// regular hyphens untouched.

describe("toBrandPunctuation", () => {
  it("replaces a spaced em dash with a single spaced hyphen", () => {
    expect(toBrandPunctuation("word — word")).toBe("word - word");
  });

  it("replaces an unspaced em dash", () => {
    expect(toBrandPunctuation("word—word")).toBe("word - word");
  });

  it("replaces an en dash", () => {
    expect(toBrandPunctuation("word – word")).toBe("word - word");
  });

  it("replaces every dash in a string, never leaving double spaces", () => {
    expect(toBrandPunctuation("one — two—three – four")).toBe(
      "one - two - three - four",
    );
  });

  it("leaves a dash-free string unchanged", () => {
    expect(toBrandPunctuation("A night at Chateau Chloe.")).toBe(
      "A night at Chateau Chloe.",
    );
  });

  it("is idempotent - running it twice yields the same result", () => {
    const once = toBrandPunctuation("word — word – more");
    expect(toBrandPunctuation(once)).toBe(once);
  });

  it("leaves regular hyphens intact", () => {
    expect(toBrandPunctuation("a low-key night - unhurried")).toBe(
      "a low-key night - unhurried",
    );
  });
});
