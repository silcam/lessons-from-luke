import React from "react";
import { render, fireEvent } from "@testing-library/react";
import TextArea from "./TextArea";

describe("TextArea", () => {
  it("renders a textarea", () => {
    const { container } = render(
      <TextArea value="hello" setValue={jest.fn()} />
    );
    expect(container.querySelector("textarea")).toBeTruthy();
  });

  it("displays the provided value", () => {
    const { container } = render(
      <TextArea value="initial text" setValue={jest.fn()} />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.value).toBe("initial text");
  });

  it("calls setValue on change", () => {
    const setValue = jest.fn();
    const { container } = render(<TextArea value="" setValue={setValue} />);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "new text" } });
    expect(setValue).toHaveBeenCalledWith("new text");
  });

  it("transforms << and >> to guillemets when commonSubs is true", () => {
    const setValue = jest.fn();
    const { container } = render(
      <TextArea value="" setValue={setValue} commonSubs />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "<<hello>>" } });
    expect(setValue).toHaveBeenCalledWith("«hello»");
  });

  it("does not transform << and >> when commonSubs is false", () => {
    const setValue = jest.fn();
    const { container } = render(
      <TextArea value="" setValue={setValue} commonSubs={false} />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "<<hello>>" } });
    expect(setValue).toHaveBeenCalledWith("<<hello>>");
  });

  it("does not transform when commonSubs is not set", () => {
    const setValue = jest.fn();
    const { container } = render(<TextArea value="" setValue={setValue} />);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "<<test>>" } });
    expect(setValue).toHaveBeenCalledWith("<<test>>");
  });

  it("calls onBlur when blurred", () => {
    const onBlur = jest.fn();
    const { container } = render(
      <TextArea value="" setValue={jest.fn()} onBlur={onBlur} />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.blur(ta);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("uses provided taRef", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    const { container } = render(
      <TextArea
        value="ref test"
        setValue={jest.fn()}
        taRef={ref as React.MutableRefObject<HTMLTextAreaElement | null>}
      />
    );
    expect(ref.current).toBeTruthy();
    expect(ref.current!.value).toBe("ref test");
  });

  it("renders with placeholder", () => {
    const { container } = render(
      <TextArea value="" setValue={jest.fn()} placeholder="Enter text here" />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.placeholder).toBe("Enter text here");
  });
});
