import React from "react";
import { render, screen } from "@testing-library/react";
import SplashScreen from "./SplashScreen";

describe("SplashScreen", () => {
  it("renders without crashing", () => {
    const { container } = render(<SplashScreen />);
    expect(container).toBeTruthy();
  });

  it("shows loading text", () => {
    render(<SplashScreen />);
    expect(screen.getByText(/"Loading\.\.\."/)).toBeTruthy();
  });
});
