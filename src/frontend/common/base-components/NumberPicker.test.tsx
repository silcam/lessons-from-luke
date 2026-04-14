import React from "react";
import { render, fireEvent } from "@testing-library/react";
import NumberPicker from "./NumberPicker";

describe("NumberPicker", () => {
  it("renders with a value", () => {
    const { container } = render(
      <NumberPicker value={5} setValue={jest.fn()} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("5");
  });

  it("calls setValue with incremented value when + button is clicked", () => {
    const setValue = jest.fn();
    const { getByText } = render(
      <NumberPicker value={5} setValue={setValue} />
    );
    fireEvent.click(getByText("+"));
    expect(setValue).toHaveBeenCalledWith(6);
  });

  it("calls setValue with decremented value when - button is clicked", () => {
    const setValue = jest.fn();
    const { getByText } = render(
      <NumberPicker value={5} setValue={setValue} />
    );
    fireEvent.click(getByText("-"));
    expect(setValue).toHaveBeenCalledWith(4);
  });

  it("disables - button when value is at minimum (default min = 1)", () => {
    const { getByText } = render(
      <NumberPicker value={1} setValue={jest.fn()} />
    );
    const minusBtn = getByText("-").closest("button") as HTMLButtonElement;
    expect(minusBtn.disabled).toBe(true);
  });

  it("does not disable - button when value is above minimum", () => {
    const { getByText } = render(
      <NumberPicker value={3} setValue={jest.fn()} />
    );
    const minusBtn = getByText("-").closest("button") as HTMLButtonElement;
    expect(minusBtn.disabled).toBe(false);
  });

  it("disables + button when value is at maximum", () => {
    const { getByText } = render(
      <NumberPicker value={10} setValue={jest.fn()} maximum={10} />
    );
    const plusBtn = getByText("+").closest("button") as HTMLButtonElement;
    expect(plusBtn.disabled).toBe(true);
  });

  it("does not disable + button when no maximum is set", () => {
    const { getByText } = render(
      <NumberPicker value={999} setValue={jest.fn()} />
    );
    const plusBtn = getByText("+").closest("button") as HTMLButtonElement;
    expect(plusBtn.disabled).toBe(false);
  });

  it("does not disable + button when value is below maximum", () => {
    const { getByText } = render(
      <NumberPicker value={5} setValue={jest.fn()} maximum={10} />
    );
    const plusBtn = getByText("+").closest("button") as HTMLButtonElement;
    expect(plusBtn.disabled).toBe(false);
  });

  it("disables input when noType is true", () => {
    const { container } = render(
      <NumberPicker value={5} setValue={jest.fn()} noType />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("does not disable input when noType is false", () => {
    const { container } = render(
      <NumberPicker value={5} setValue={jest.fn()} noType={false} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });

  it("shows empty string when value is below minimum", () => {
    const { container } = render(
      <NumberPicker value={0} setValue={jest.fn()} minimum={1} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("respects a custom minimum", () => {
    const setValue = jest.fn();
    const { getByText } = render(
      <NumberPicker value={3} setValue={setValue} minimum={3} />
    );
    const minusBtn = getByText("-").closest("button") as HTMLButtonElement;
    expect(minusBtn.disabled).toBe(true);
  });

  it("calls setValue when user types in the input", () => {
    const setValue = jest.fn();
    const { container } = render(
      <NumberPicker value={5} setValue={setValue} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7" } });
    expect(setValue).toHaveBeenCalledWith(7);
  });

  it("calls setValue with 0 when user types non-numeric input", () => {
    const setValue = jest.fn();
    const { container } = render(
      <NumberPicker value={5} setValue={setValue} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    expect(setValue).toHaveBeenCalledWith(0);
  });
});
