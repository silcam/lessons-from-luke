import React from "react";
import { render } from "@testing-library/react";
import P from "./P";

describe("P", () => {
  it("renders children", () => {
    const { getByText } = render(<P>Hello world</P>);
    expect(getByText("Hello world")).toBeTruthy();
  });

  it("renders as a p element", () => {
    const { container } = render(<P>Text</P>);
    expect(container.querySelector("p")).toBeTruthy();
  });

  it("renders without subdued prop", () => {
    const { container } = render(<P>Normal text</P>);
    const p = container.querySelector("p");
    expect(p).toBeTruthy();
  });

  it("renders with subdued prop", () => {
    const { container } = render(<P subdued>Subdued text</P>);
    const p = container.querySelector("p");
    expect(p).toBeTruthy();
  });
});
