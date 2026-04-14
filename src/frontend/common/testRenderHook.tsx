/**
 * Minimal renderHook implementation for @testing-library/react v10
 * which does not include renderHook (that was added in v13).
 *
 * Usage:
 *   const hook = renderHook(() => myHook(), { wrapper: Wrapper });
 *   expect(hook.result.current).toBe(...);
 *   act(() => { hook.result.current.doSomething(); });
 *
 * NOTE: Do NOT destructure `result` from the return value:
 *   const { result } = renderHook(...)  // WRONG - result.current becomes stale
 *   const hook = renderHook(...)        // CORRECT - hook.result.current is always fresh
 */
import React from "react";
import { render, act } from "@testing-library/react";

export { act } from "@testing-library/react";

export function renderHook<TResult>(
  renderCallback: () => TResult,
  options?: { wrapper?: React.ComponentType; initialProps?: any }
) {
  // Use a mutable container so result.current is always fresh
  const resultContainer: { current: TResult } = { current: undefined as any };

  const TestComponent: React.FC = () => {
    resultContainer.current = renderCallback();
    return null;
  };

  const buildElement = (wrapper?: React.ComponentType) =>
    wrapper
      ? React.createElement(wrapper, null, React.createElement(TestComponent))
      : React.createElement(TestComponent);

  const { rerender: baseRerender, unmount } = render(
    buildElement(options?.wrapper)
  );

  return {
    result: resultContainer,
    rerender: (newOptions?: { wrapper?: React.ComponentType }) => {
      act(() => {
        baseRerender(buildElement(newOptions?.wrapper ?? options?.wrapper));
      });
    },
    unmount
  };
}
