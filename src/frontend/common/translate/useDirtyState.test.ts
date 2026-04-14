import { act } from "@testing-library/react";
import { renderHook } from "../testRenderHook";
import useDirtyState from "./useDirtyState";

describe("useDirtyState", () => {
  it("starts not dirty", () => {
    const onStateChange = jest.fn();
    const { result } = renderHook(() => useDirtyState(onStateChange));
    expect(result.current.dirty).toBe(false);
  });

  it("becomes dirty when setDirty is called", () => {
    const onStateChange = jest.fn();
    const { result } = renderHook(() => useDirtyState(onStateChange));

    act(() => {
      result.current.setDirty(1);
    });

    expect(result.current.dirty).toBe(true);
  });

  it("becomes clean again when all dirty items are cleaned", () => {
    const onStateChange = jest.fn();
    const { result } = renderHook(() => useDirtyState(onStateChange));

    act(() => {
      result.current.setDirty(1);
    });

    expect(result.current.dirty).toBe(true);

    act(() => {
      result.current.setClean(1);
    });

    expect(result.current.dirty).toBe(false);
  });

  it("tracks multiple dirty items independently", () => {
    const onStateChange = jest.fn();
    const { result } = renderHook(() => useDirtyState(onStateChange));

    act(() => {
      result.current.setDirty(1);
    });
    act(() => {
      result.current.setDirty(2);
    });

    expect(result.current.dirty).toBe(true);

    act(() => {
      result.current.setClean(1);
    });

    // Still dirty because id 2 is still dirty
    expect(result.current.dirty).toBe(true);

    act(() => {
      result.current.setClean(2);
    });

    expect(result.current.dirty).toBe(false);
  });

  it("calls onStateChange when state transitions from dirty to clean", () => {
    const onStateChange = jest.fn();
    const { result } = renderHook(() => useDirtyState(onStateChange));

    // Make dirty first
    act(() => {
      result.current.setDirty(1);
    });

    // Make clean - should trigger onStateChange(false)
    act(() => {
      result.current.setClean(1);
    });

    expect(onStateChange).toHaveBeenCalledWith(false);
  });
});
