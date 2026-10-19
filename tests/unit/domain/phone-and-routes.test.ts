import { describe, expect, it } from "vitest";
import { isE164, normalizePhoneNumber } from "@/server/domain/phone";
import { describeRoute } from "@/server/domain/routes";

describe("normalizePhoneNumber", () => {
  it.each([
    ["0712 345 678", "+254712345678"],
    ["0712-345-678", "+254712345678"],
    ["0110 123456", "+254110123456"],
    ["254712345678", "+254712345678"],
    ["+254 712 345 678", "+254712345678"],
    ["+1 (415) 555-0100", "+14155550100"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it("returns null for blank input (clears the number)", () => {
    expect(normalizePhoneNumber("   ")).toBeNull();
  });

  it("produces E.164 for Kenyan numbers", () => {
    expect(isE164(normalizePhoneNumber("0712345678")!)).toBe(true);
    expect(isE164("12345")).toBe(false);
  });
});

describe("describeRoute", () => {
  it("labels unassigned, single and multi-stage routes", () => {
    expect(describeRoute([])).toBe("Not Assigned");
    expect(describeRoute(["Westlands"])).toBe("Westlands");
    expect(describeRoute(["Westlands", "Archives", "Kencom"])).toBe("Archives - Westlands");
  });

  it("does not mutate its input", () => {
    const names = ["b", "a"];
    describeRoute(names);
    expect(names).toEqual(["b", "a"]);
  });
});
