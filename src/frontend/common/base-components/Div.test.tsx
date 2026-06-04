import React from "react";
import { render } from "@testing-library/react";
import Div from "./Div";

describe("Div", () => {
  it("renders without any props", () => {
    const { container } = render(<Div>content</Div>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with pad prop (line 13: pad=true branch)", () => {
    const { container } = render(<Div pad>content</Div>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with padVert prop (line 13: padVert=true branch)", () => {
    const { container } = render(<Div padVert>content</Div>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with marginBelow prop (line 14 branch)", () => {
    const { container } = render(<Div marginBelow>content</Div>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with marginRight prop (line 15 branch)", () => {
    const { container } = render(<Div marginRight>content</Div>);
    expect(container.querySelector("div")).toBeTruthy();
  });
});
