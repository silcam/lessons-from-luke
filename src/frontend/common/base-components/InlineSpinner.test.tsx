import React from "react";
import { render } from "@testing-library/react";
import InlineSpinner from "./InlineSpinner";

describe("InlineSpinner", () => {
  it("renders a span", () => {
    const { container } = render(<InlineSpinner />);
    expect(container.querySelector("span")).toBeTruthy();
  });

  it("is hidden from assistive technology", () => {
    const { container } = render(<InlineSpinner />);
    expect(container.querySelector("span")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("carries no inline style attribute (production CSP forbids style-src-attr)", () => {
    const { container } = render(<InlineSpinner />);
    expect(container.querySelector("span")?.hasAttribute("style")).toBe(false);
  });
});
