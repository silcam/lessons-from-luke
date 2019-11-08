import { TStrings } from "../../src/core/TString";
import tStringHistory from "../../src/core/TStringHistory";

test("tStringHistory", () => {
  const oldTStrings: TStrings = [
    { id: 0, xpath: "", src: "Dog", targetText: "Chien" },
    { id: 1, xpath: "", src: "Cat", targetText: "Chat" },
    { id: 2, xpath: "", src: "Frog", targetText: "" }
  ];
  const newTStrings: TStrings = [
    { id: 0, xpath: "", src: "Dog", targetText: "Chien" },
    { id: 1, xpath: "", src: "Cat", targetText: "Le Chat" },
    { id: 2, xpath: "", src: "Frog", targetText: "Grenouille" }
  ];
  const history = tStringHistory([], oldTStrings, newTStrings);
  expect(history[0].time).toBeGreaterThan(1570109511740);
  expect(history[0].tStrings).toEqual([
    { id: 1, xpath: "", src: "Cat", targetText: "Chat" }
  ]);
});

test("tStringHistory nothing to save", () => {
  const oldTStrings: TStrings = [
    { id: 0, xpath: "", src: "Dog", targetText: "Chien" },
    { id: 1, xpath: "", src: "Cat", targetText: "" }
  ];
  const newTStrings: TStrings = [
    { id: 0, xpath: "", src: "Dog", targetText: "Chien" },
    { id: 1, xpath: "", src: "Cat", targetText: "Chat" }
  ];
  expect(tStringHistory([], oldTStrings, newTStrings)).toEqual([]);
});
