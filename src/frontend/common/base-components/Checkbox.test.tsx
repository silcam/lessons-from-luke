import React from "react";
import { render, fireEvent } from "@testing-library/react";
import Checkbox from "./Checkbox";

describe("Checkbox", () => {
  it("renders with label and unchecked state", () => {
    const { container, getByText } = render(
      <Checkbox label="Accept terms" value={false} setValue={jest.fn()} />
    );
    expect(getByText("Accept terms")).toBeTruthy();
    const checkbox = container.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("renders with checked state", () => {
    const { container } = render(
      <Checkbox label="Accept terms" value={true} setValue={jest.fn()} />
    );
    const checkbox = container.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("calls setValue when checkbox is clicked", () => {
    const setValue = jest.fn();
    const { container } = render(
      <Checkbox label="Accept" value={false} setValue={setValue} />
    );
    const checkbox = container.querySelector("input[type=checkbox]") as HTMLInputElement;
    // fireEvent.click triggers the onChange handler in React
    fireEvent.click(checkbox);
    expect(setValue).toHaveBeenCalled();
  });
});
