import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import StatusfulTextArea from "./StatusfulTextArea";

function makeSaveValue(success = true) {
  return jest.fn().mockResolvedValue(success);
}

describe("StatusfulTextArea", () => {
  it("renders a textarea", () => {
    const { container } = render(
      <StatusfulTextArea
        value="initial"
        saveValue={makeSaveValue()}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />
    );
    expect(container.querySelector("textarea")).toBeTruthy();
  });

  it("displays the provided value in none state", () => {
    const { container } = render(
      <StatusfulTextArea
        value="my text"
        saveValue={makeSaveValue()}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.value).toBe("my text");
  });

  it("transitions to dirty state and calls markDirty when text changes", async () => {
    const markDirty = jest.fn();
    const { container } = render(
      <StatusfulTextArea
        value=""
        saveValue={makeSaveValue()}
        markDirty={markDirty}
        markClean={jest.fn()}
      />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(ta, { target: { value: "new text" } });
    });
    expect(markDirty).toHaveBeenCalled();
  });

  it("shows the locally-edited text in dirty state", async () => {
    const { container } = render(
      <StatusfulTextArea
        value="original"
        saveValue={makeSaveValue()}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(ta, { target: { value: "edited" } });
    });
    expect(ta.value).toBe("edited");
  });

  it("transitions to working state and calls saveValue on blur", async () => {
    const saveValue = makeSaveValue();
    const { container } = render(
      <StatusfulTextArea
        value=""
        saveValue={saveValue}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(ta, { target: { value: "edited" } });
    });
    await act(async () => {
      fireEvent.blur(ta);
    });
    expect(saveValue).toHaveBeenCalledWith("edited");
  });

  it("does not call saveValue on blur when in none state", async () => {
    const saveValue = makeSaveValue();
    const { container } = render(
      <StatusfulTextArea
        value="text"
        saveValue={saveValue}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.blur(ta);
    });
    expect(saveValue).not.toHaveBeenCalled();
  });

  it("transitions to clean state when props.value changes while dirty", async () => {
    const markClean = jest.fn();
    const { container, rerender } = render(
      <StatusfulTextArea
        value="original"
        saveValue={makeSaveValue()}
        markDirty={jest.fn()}
        markClean={markClean}
      />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(ta, { target: { value: "edited" } });
    });
    await act(async () => {
      rerender(
        <StatusfulTextArea
          value="updated from server"
          saveValue={makeSaveValue()}
          markDirty={jest.fn()}
          markClean={markClean}
        />
      );
    });
    expect(markClean).toHaveBeenCalled();
  });

  it("calls saveOnEnter and saves when Enter is pressed and saveOnEnter is provided", async () => {
    const saveValue = makeSaveValue();
    const saveOnEnter = jest.fn();
    const { container } = render(
      <StatusfulTextArea
        value=""
        saveValue={saveValue}
        markDirty={jest.fn()}
        markClean={jest.fn()}
        saveOnEnter={saveOnEnter}
      />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(ta, { target: { value: "text" } });
    });
    await act(async () => {
      fireEvent.keyDown(ta, { key: "Enter" });
    });
    expect(saveValue).toHaveBeenCalledWith("text");
    expect(saveOnEnter).toHaveBeenCalledTimes(1);
  });

  it("does not call saveOnEnter when Enter is pressed but saveOnEnter is not provided", async () => {
    const saveValue = makeSaveValue();
    const { container } = render(
      <StatusfulTextArea
        value=""
        saveValue={saveValue}
        markDirty={jest.fn()}
        markClean={jest.fn()}
      />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(ta, { target: { value: "text" } });
    });
    await act(async () => {
      fireEvent.keyDown(ta, { key: "Enter" });
    });
    // saveValue should NOT be called because saveOnEnter guard prevents it
    expect(saveValue).not.toHaveBeenCalled();
  });

  it("does not call saveOnEnter for non-Enter key presses", async () => {
    const saveOnEnter = jest.fn();
    const { container } = render(
      <StatusfulTextArea
        value=""
        saveValue={makeSaveValue()}
        markDirty={jest.fn()}
        markClean={jest.fn()}
        saveOnEnter={saveOnEnter}
      />
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(ta, { target: { value: "text" } });
    });
    await act(async () => {
      fireEvent.keyDown(ta, { key: "Tab" });
    });
    expect(saveOnEnter).not.toHaveBeenCalled();
  });
});
