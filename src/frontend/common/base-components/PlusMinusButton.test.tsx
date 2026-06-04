import React from "react";
import { render, fireEvent } from "@testing-library/react";
import PlusMinusButton from "./PlusMinusButton";

describe("PlusMinusButton", () => {
  it("renders '+' when plus is true", () => {
    const { getByText } = render(
      <PlusMinusButton plus={true} setPlus={jest.fn()} />
    );
    expect(getByText("+")).toBeTruthy();
  });

  it("renders '-' when plus is false", () => {
    const { getByText } = render(
      <PlusMinusButton plus={false} setPlus={jest.fn()} />
    );
    expect(getByText("-")).toBeTruthy();
  });

  it("calls setPlus with false when clicked in plus state", () => {
    const setPlus = jest.fn();
    const { getByText } = render(
      <PlusMinusButton plus={true} setPlus={setPlus} />
    );
    fireEvent.click(getByText("+"));
    expect(setPlus).toHaveBeenCalledWith(false);
  });

  it("calls setPlus with true when clicked in minus state", () => {
    const setPlus = jest.fn();
    const { getByText } = render(
      <PlusMinusButton plus={false} setPlus={setPlus} />
    );
    fireEvent.click(getByText("-"));
    expect(setPlus).toHaveBeenCalledWith(true);
  });

  it("renders a button element", () => {
    const { container } = render(
      <PlusMinusButton plus={true} setPlus={jest.fn()} />
    );
    expect(container.querySelector("button")).toBeTruthy();
  });
});
