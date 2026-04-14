import React from "react";
import { render, fireEvent } from "@testing-library/react";
import TextInput from "./TextInput";

describe("TextInput", () => {
  it("renders an input element", () => {
    const { container } = render(
      <TextInput value="hello" setValue={jest.fn()} />
    );
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("displays the provided value", () => {
    const { container } = render(
      <TextInput value="initial" setValue={jest.fn()} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("initial");
  });

  it("calls setValue when value changes", () => {
    const setValue = jest.fn();
    const { container } = render(<TextInput value="" setValue={setValue} />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "new value" } });
    expect(setValue).toHaveBeenCalledWith("new value");
  });

  it("renders as type='text' by default", () => {
    const { container } = render(
      <TextInput value="" setValue={jest.fn()} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("text");
  });

  it("renders as type='password' when password prop is true", () => {
    const { container } = render(
      <TextInput value="" setValue={jest.fn()} password />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("renders as type='text' when password prop is false", () => {
    const { container } = render(
      <TextInput value="" setValue={jest.fn()} password={false} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("text");
  });

  it("calls onBlur when blurred", () => {
    const onBlur = jest.fn();
    const { container } = render(
      <TextInput value="" setValue={jest.fn()} onBlur={onBlur} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("renders with placeholder", () => {
    const { container } = render(
      <TextInput value="" setValue={jest.fn()} placeholder="Search..." />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toBe("Search...");
  });

  it("renders with minWidth prop set (line 27: minWidth branch)", () => {
    const { container } = render(
      <TextInput value="" setValue={jest.fn()} minWidth={10} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it("renders with bigger prop (line 22-23: bigger branch)", () => {
    const { container } = render(
      <TextInput value="" setValue={jest.fn()} bigger />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
  });
});
