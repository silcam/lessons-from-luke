import React from "react";
import { render, fireEvent } from "@testing-library/react";
import Button from "./Button";

describe("Button", () => {
  it("renders with text", () => {
    const { getByText } = render(
      <Button text="Click me" onClick={jest.fn()} />
    );
    expect(getByText("Click me")).toBeTruthy();
  });

  it("fires onClick when clicked", () => {
    const onClick = jest.fn();
    const { getByText } = render(<Button text="Click me" onClick={onClick} />);
    fireEvent.click(getByText("Click me"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a standard styled button by default", () => {
    const { container } = render(
      <Button text="Button" onClick={jest.fn()} />
    );
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("renders as a link-styled button when link prop is true", () => {
    const { container } = render(
      <Button text="Link" onClick={jest.fn()} link />
    );
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("is disabled when disabled prop is true", () => {
    const { container } = render(
      <Button text="Disabled" onClick={jest.fn()} disabled />
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("is not disabled by default", () => {
    const { container } = render(
      <Button text="Normal" onClick={jest.fn()} />
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("is disabled when unButton prop is true", () => {
    const { container } = render(
      <Button text="UnButton" onClick={jest.fn()} link unButton />
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("renders with red prop", () => {
    const { container } = render(
      <Button text="Delete" onClick={jest.fn()} red />
    );
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("renders with bigger prop", () => {
    const { container } = render(
      <Button text="Big" onClick={jest.fn()} bigger />
    );
    expect(container.querySelector("button")).toBeTruthy();
  });

  it("blurs button on mouseUp (line 88)", () => {
    const { container } = render(<Button text="Click me" onClick={jest.fn()} />);
    const btn = container.querySelector("button") as HTMLButtonElement;
    // Simulate focus then mouseup to trigger the blur handler
    btn.focus();
    const blurSpy = jest.spyOn(btn, "blur");
    fireEvent.mouseUp(btn);
    expect(blurSpy).toHaveBeenCalled();
    blurSpy.mockRestore();
  });
});
