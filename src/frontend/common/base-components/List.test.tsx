import React from "react";
import { render } from "@testing-library/react";
import List from "./List";

describe("List", () => {
  it("renders an empty list", () => {
    const { container } = render(
      <List items={[]} renderItem={item => <span>{String(item)}</span>} />
    );
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders items", () => {
    const { getByText } = render(
      <List
        items={["Alpha", "Beta"]}
        renderItem={item => <span>{item}</span>}
      />
    );
    expect(getByText("Alpha")).toBeTruthy();
    expect(getByText("Beta")).toBeTruthy();
  });

  it("renders with noBorders prop (branch: noBorders=true)", () => {
    const { container } = render(
      <List
        items={["A"]}
        noBorders
        renderItem={item => <span>{item}</span>}
      />
    );
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with hoverStriping prop (branch: hoverStriping=true)", () => {
    const { container } = render(
      <List
        items={["A"]}
        hoverStriping
        renderItem={item => <span>{item}</span>}
      />
    );
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with noXPad prop (branch: noXPad=true)", () => {
    const { container } = render(
      <List
        items={["A"]}
        noXPad
        renderItem={item => <span>{item}</span>}
      />
    );
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("uses itemKey when provided", () => {
    const { container } = render(
      <List
        items={[{ id: 1, name: "Item" }]}
        renderItem={item => <span>{item.name}</span>}
        itemKey={item => item.id}
      />
    );
    expect(container.querySelector("div")).toBeTruthy();
  });
});
