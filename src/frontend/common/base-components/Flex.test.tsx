import React from "react";
import { render } from "@testing-library/react";
import { FlexCol, FlexRow } from "./Flex";

describe("FlexCol", () => {
  it("renders without props", () => {
    const { container } = render(<FlexCol>content</FlexCol>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with flexZero prop", () => {
    const { container } = render(<FlexCol flexZero>content</FlexCol>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with flexRoot prop", () => {
    const { container } = render(<FlexCol flexRoot>content</FlexCol>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with alignCenter prop", () => {
    const { container } = render(<FlexCol alignCenter>content</FlexCol>);
    expect(container.querySelector("div")).toBeTruthy();
  });
});

describe("FlexRow", () => {
  it("renders without props", () => {
    const { container } = render(<FlexRow>content</FlexRow>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with spaceBetween prop", () => {
    const { container } = render(<FlexRow spaceBetween>content</FlexRow>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with flexZero prop", () => {
    const { container } = render(<FlexRow flexZero>content</FlexRow>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with flexRoot prop", () => {
    const { container } = render(<FlexRow flexRoot>content</FlexRow>);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with alignCenter prop", () => {
    const { container } = render(<FlexRow alignCenter>content</FlexRow>);
    expect(container.querySelector("div")).toBeTruthy();
  });
});
