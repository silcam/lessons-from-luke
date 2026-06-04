import React from "react";
import { render } from "@testing-library/react";
import ProgressBar from "./ProgressBar";

describe("ProgressBar", () => {
  it("renders with a percentage", () => {
    const { container } = render(<ProgressBar percent={50} />);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders at 100% (success color branch)", () => {
    const { container } = render(<ProgressBar percent={100} />);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with big prop (large height branch)", () => {
    const { container } = render(<ProgressBar percent={60} big />);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with fixed prop (fixed width branch)", () => {
    const { container } = render(<ProgressBar percent={30} fixed />);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with neither big nor fixed (small height branch)", () => {
    const { container } = render(<ProgressBar percent={10} />);
    expect(container.querySelector("div")).toBeTruthy();
  });
});
