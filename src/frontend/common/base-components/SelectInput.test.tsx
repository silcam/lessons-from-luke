import React from "react";
import { render, fireEvent } from "@testing-library/react";
import SelectInput, { optionsDisplayIsKey } from "./SelectInput";

describe("SelectInput", () => {
  it("renders a select element with options", () => {
    const { container } = render(
      <SelectInput
        value="a"
        setValue={jest.fn()}
        options={[["a", "Option A"], ["b", "Option B"]]}
      />
    );
    expect(container.querySelector("select")).toBeTruthy();
  });

  it("shows the current value as selected", () => {
    const { container } = render(
      <SelectInput
        value="b"
        setValue={jest.fn()}
        options={[["a", "Option A"], ["b", "Option B"]]}
      />
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("b");
  });

  it("calls setValue when selection changes", () => {
    const setValue = jest.fn();
    const { container } = render(
      <SelectInput
        value="a"
        setValue={setValue}
        options={[["a", "Option A"], ["b", "Option B"]]}
      />
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "b" } });
    expect(setValue).toHaveBeenCalledWith("b");
  });
});

describe("optionsDisplayIsKey", () => {
  it("maps each option to a [key, key] pair (line 27)", () => {
    const result = optionsDisplayIsKey(["en", "fr", "es"]);
    expect(result).toEqual([["en", "en"], ["fr", "fr"], ["es", "es"]]);
  });
});
