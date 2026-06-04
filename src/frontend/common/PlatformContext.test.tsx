import React, { useContext } from "react";
import { renderHook } from "./testRenderHook";
import PlatformContext from "./PlatformContext";

describe("PlatformContext", () => {
  it("provides 'web' as the default context value", () => {
    const { result } = renderHook(() => useContext(PlatformContext));
    expect(result.current).toBe("web");
  });

  it("provides 'web' when wrapped with web value", () => {
    const Wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
      <PlatformContext.Provider value="web">
        {children}
      </PlatformContext.Provider>
    );

    const { result } = renderHook(() => useContext(PlatformContext), {
      wrapper: Wrapper
    });

    expect(result.current).toBe("web");
  });

  it("provides 'desktop' when wrapped with desktop value", () => {
    const Wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
      <PlatformContext.Provider value="desktop">
        {children}
      </PlatformContext.Provider>
    );

    const { result } = renderHook(() => useContext(PlatformContext), {
      wrapper: Wrapper
    });

    expect(result.current).toBe("desktop");
  });

  it("allows consumers to check platform equality", () => {
    const Wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
      <PlatformContext.Provider value="desktop">
        {children}
      </PlatformContext.Provider>
    );

    const { result } = renderHook(
      () => {
        const platform = useContext(PlatformContext);
        return {
          isDesktop: platform === "desktop",
          isWeb: platform === "web"
        };
      },
      { wrapper: Wrapper }
    );

    expect(result.current.isDesktop).toBe(true);
    expect(result.current.isWeb).toBe(false);
  });
});
