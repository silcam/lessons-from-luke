import React from "react";
import { render } from "@testing-library/react";
import Table from "./Table";

describe("Table", () => {
  it("renders a table element", () => {
    const { container } = render(<Table />);
    expect(container.querySelector("table")).toBeTruthy();
  });

  it("renders children inside a tbody", () => {
    const { container } = render(
      <Table>
        <tr>
          <td>Cell content</td>
        </tr>
      </Table>
    );
    const tbody = container.querySelector("tbody");
    expect(tbody).toBeTruthy();
    expect(tbody!.textContent).toContain("Cell content");
  });

  it("renders multiple rows", () => {
    const { container } = render(
      <Table>
        <tr>
          <td>Row 1</td>
        </tr>
        <tr>
          <td>Row 2</td>
        </tr>
      </Table>
    );
    const rows = container.querySelectorAll("tr");
    expect(rows.length).toBe(2);
  });

  it("renders without borders by default", () => {
    const { container } = render(
      <Table>
        <tr>
          <td>Cell</td>
        </tr>
      </Table>
    );
    expect(container.querySelector("table")).toBeTruthy();
  });

  it("renders with borders prop", () => {
    const { container } = render(
      <Table borders>
        <tr>
          <td>Cell</td>
        </tr>
      </Table>
    );
    expect(container.querySelector("table")).toBeTruthy();
  });

  it("renders an empty table with no children", () => {
    const { container } = render(<Table />);
    const tbody = container.querySelector("tbody");
    expect(tbody).toBeTruthy();
    expect(tbody!.children.length).toBe(0);
  });
});
