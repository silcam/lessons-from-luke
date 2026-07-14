import { canAutoTranslate } from "./defaultTranslations";

describe("canAutoTranslate", () => {
  describe("numeric verse-reference shapes", () => {
    it("matches a single-chapter verse range with an en-dash", () => {
      expect(canAutoTranslate("1:5–25")).toBe(true);
    });

    it("matches a single-chapter verse range with a hyphen", () => {
      expect(canAutoTranslate("1:5-25")).toBe(true);
    });

    it("matches a cross-chapter verse range", () => {
      expect(canAutoTranslate("18:35–19:10")).toBe(true);
    });

    it("matches a verse range with leading/trailing whitespace (trimmed before match)", () => {
      expect(canAutoTranslate(" 1:5–25 ")).toBe(true);
    });
  });

  describe("existing digit-only behavior (no regression)", () => {
    it("still matches a bare lesson number", () => {
      expect(canAutoTranslate("3")).toBe(true);
    });

    it("still matches a bare lesson number", () => {
      expect(canAutoTranslate("5")).toBe(true);
    });
  });

  describe("non-matching prose and malformed shapes", () => {
    it("never matches a bare word", () => {
      expect(canAutoTranslate("Luke")).toBe(false);
    });

    it("never matches prose containing a reference-like substring", () => {
      expect(canAutoTranslate("Bible Story: Luke 10:25–37")).toBe(false);
    });

    it("does not match a shape with no range separator", () => {
      expect(canAutoTranslate("3:00")).toBe(false);
    });
  });
});
