import { onlyWhitespace, escapeHTML } from "./stringUtils";

test("onlyWhitespace", () => {
  expect(onlyWhitespace("    \t\n")).toBe(true);
  expect(onlyWhitespace("   a  ")).toBe(false);
  expect(onlyWhitespace("   .  ")).toBe(false);
});

test("escapeHTML escapes &, <, and > characters", () => {
  expect(escapeHTML("a & b")).toBe("a &amp; b");
  expect(escapeHTML("<div>")).toBe("&lt;div&gt;");
  expect(escapeHTML("a < b > c")).toBe("a &lt; b &gt; c");
  expect(escapeHTML("no special chars")).toBe("no special chars");
});
