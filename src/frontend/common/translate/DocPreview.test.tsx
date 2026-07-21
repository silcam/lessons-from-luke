import React from "react";
import { render } from "@testing-library/react";
import DocPreview from "./DocPreview";
import { LessonTString } from "./useLessonTStrings";
import { sampleLessonString, sampleTString } from "../testHelpers";

// jsdom does not enforce CSP, so these assert the structure and behavior the CSP
// fixes depend on (data-attribute delegation, nonce stamping), not CSP itself.

function ltString(lessonStringId: number, text: string): LessonTString {
  return {
    lStr: { ...sampleLessonString, lessonStringId },
    tStrs: [{ ...sampleTString, text }],
  };
}

function renderPreview(overrides: Partial<React.ComponentProps<typeof DocPreview>> = {}) {
  const props: React.ComponentProps<typeof DocPreview> = {
    lessonId: 5,
    srcLangId: 1,
    targetLangId: 42,
    docHtml: "<p>##10##</p>",
    ltStringsForTranslation: [ltString(10, "First string")],
    otherLTStrings: [],
    setSelectedIndex: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<DocPreview {...props} />) };
}

describe("DocPreview", () => {
  afterEach(() => {
    document.head.querySelectorAll('meta[name="csp-nonce"]').forEach((el) => el.remove());
  });

  describe("clickable lesson strings (Part B — no inline onclick)", () => {
    it("emits spans with data-ls-index and no onclick attribute", () => {
      const { container } = renderPreview();
      const span = container.querySelector(".lessonString");
      expect(span).not.toBeNull();
      expect(span!.getAttribute("data-ls-index")).toBe("0");
      expect(span!.getAttribute("onclick")).toBeNull();
    });

    it("calls setSelectedIndex with the clicked string's index via delegation", () => {
      const setSelectedIndex = jest.fn();
      const { container } = renderPreview({
        docHtml: "<p>##10## ##11##</p>",
        ltStringsForTranslation: [ltString(10, "First"), ltString(11, "Second")],
        setSelectedIndex,
      });

      const spans = container.querySelectorAll(".lessonString");
      expect(spans).toHaveLength(2);

      spans[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(setSelectedIndex).toHaveBeenCalledWith(1);
    });

    it("ignores clicks that are not on a lesson string", () => {
      const setSelectedIndex = jest.fn();
      const { container } = renderPreview({ setSelectedIndex });
      container.firstElementChild!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(setSelectedIndex).not.toHaveBeenCalled();
    });
  });

  describe("style nonce stamping (Part A)", () => {
    function setNonce(value: string) {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "csp-nonce");
      meta.setAttribute("content", value);
      document.head.appendChild(meta);
    }

    it("stamps the document nonce onto <style> elements when the meta is present", () => {
      setNonce("test-nonce-123");
      const { container } = renderPreview({
        docHtml: "<style>p { orphans: 2; }</style><p>##10##</p>",
      });
      const style = container.querySelector("style");
      expect(style).not.toBeNull();
      expect(style!.getAttribute("nonce")).toBe("test-nonce-123");
    });

    it("leaves <style> unstamped when there is no csp-nonce meta (desktop path)", () => {
      const { container } = renderPreview({
        docHtml: "<style>p { orphans: 2; }</style><p>##10##</p>",
      });
      const style = container.querySelector("style");
      expect(style).not.toBeNull();
      expect(style!.getAttribute("nonce")).toBeNull();
    });
  });
});
