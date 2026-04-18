import React from "react";
import { render } from "@testing-library/react";
import Alert from "./Alert";

describe("Alert", () => {
  it("renders with default (non-danger) style", () => {
    const { container } = render(<Alert>Hello</Alert>);
    expect(container.querySelector("div")).toBeTruthy();
    expect(container.textContent).toBe("Hello");
  });

  it("renders with danger style when danger prop is true", () => {
    const { container } = render(<Alert danger>Error!</Alert>);
    expect(container.querySelector("div")).toBeTruthy();
    expect(container.textContent).toBe("Error!");
  });
});
