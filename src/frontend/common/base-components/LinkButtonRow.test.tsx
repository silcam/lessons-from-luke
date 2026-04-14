import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LinkButtonRow from "./LinkButtonRow";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("LinkButtonRow", () => {
  it("renders button items (function href)", () => {
    const onClick = jest.fn();
    const { getByText } = renderWithRouter(
      <LinkButtonRow buttons={[["Click me", onClick]]} />
    );
    expect(getByText("Click me")).toBeTruthy();
  });

  it("fires onClick when a button item is clicked", () => {
    const onClick = jest.fn();
    const { getByText } = renderWithRouter(
      <LinkButtonRow buttons={[["Click me", onClick]]} />
    );
    fireEvent.click(getByText("Click me"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders link items (string href)", () => {
    const { getByText } = renderWithRouter(
      <LinkButtonRow buttons={[["Go somewhere", "/some/path"]]} />
    );
    const link = getByText("Go somewhere");
    expect(link).toBeTruthy();
    expect(link.closest("a")).toBeTruthy();
  });

  it("link items have the correct href", () => {
    const { getByText } = renderWithRouter(
      <LinkButtonRow buttons={[["Go somewhere", "/some/path"]]} />
    );
    const anchor = getByText("Go somewhere").closest("a") as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("/some/path");
  });

  it("renders multiple items", () => {
    const onClick = jest.fn();
    const { getByText } = renderWithRouter(
      <LinkButtonRow
        buttons={[
          ["Link item", "/path"],
          ["Button item", onClick]
        ]}
      />
    );
    expect(getByText("Link item")).toBeTruthy();
    expect(getByText("Button item")).toBeTruthy();
  });

  it("renders a span wrapper for each item", () => {
    const { container } = renderWithRouter(
      <LinkButtonRow
        buttons={[
          ["First", "/path1"],
          ["Second", "/path2"]
        ]}
      />
    );
    const spans = container.querySelectorAll("span");
    expect(spans.length).toBe(2);
  });

  it("renders an empty row with no buttons", () => {
    const { container } = renderWithRouter(<LinkButtonRow buttons={[]} />);
    const spans = container.querySelectorAll("span");
    expect(spans.length).toBe(0);
  });
});
