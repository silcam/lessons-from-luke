import React from "react";
import { render, fireEvent } from "@testing-library/react";
import HandleKey from "./HandleKey";

describe("HandleKey", () => {
  it("renders children", () => {
    const { getByText } = render(
      <HandleKey>
        <span>child content</span>
      </HandleKey>
    );
    expect(getByText("child content")).toBeTruthy();
  });

  it("calls the matching onKey handler when a key is pressed", () => {
    const onEnter = jest.fn();
    const { container } = render(
      <HandleKey onEnter={onEnter}>
        <input />
      </HandleKey>
    );
    const div = container.firstChild as HTMLElement;
    fireEvent.keyPress(div, { key: "Enter", charCode: 13 });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("does not call handler for non-matching keys", () => {
    const onEnter = jest.fn();
    const { container } = render(
      <HandleKey onEnter={onEnter}>
        <input />
      </HandleKey>
    );
    const div = container.firstChild as HTMLElement;
    fireEvent.keyPress(div, { key: "Escape", charCode: 27 });
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("calls the correct handler (Enter) but not other handlers when Enter is pressed", () => {
    const onEnter = jest.fn();
    const onSpace = jest.fn();
    const { container } = render(
      <HandleKey onEnter={onEnter} onSpace={onSpace}>
        <input />
      </HandleKey>
    );
    const div = container.firstChild as HTMLElement;
    fireEvent.keyPress(div, { key: "Enter", charCode: 13 });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onSpace).not.toHaveBeenCalled();
  });

  it("does not throw when no matching handler exists for a key", () => {
    const { container } = render(
      <HandleKey>
        <input />
      </HandleKey>
    );
    const div = container.firstChild as HTMLElement;
    expect(() => {
      fireEvent.keyPress(div, { key: "Enter", charCode: 13 });
    }).not.toThrow();
  });

  it("does not call handler when the prop is not a function", () => {
    const { container } = render(
      <HandleKey onEnter={"not-a-function" as any}>
        <input />
      </HandleKey>
    );
    const div = container.firstChild as HTMLElement;
    expect(() => {
      fireEvent.keyPress(div, { key: "Enter", charCode: 13 });
    }).not.toThrow();
  });
});
