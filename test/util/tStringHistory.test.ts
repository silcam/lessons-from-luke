import { TDocString } from "../../src/util/Storage";
import tStringHistory from "../../src/util/tStringHistory";

test("tStringHistory", () => {
  const oldTStrings: TDocString[] = [
    { id: 0, xpath: "", src: "Dog", targetText: "Chien" },
    { id: 1, xpath: "", src: "Cat", targetText: "Chat" },
    { id: 2, xpath: "", src: "Frog", targetText: "" }
  ];
  const newTStrings: TDocString[] = [
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
  const oldTStrings: TDocString[] = [
    { id: 0, xpath: "", src: "Dog", targetText: "Chien" },
    { id: 1, xpath: "", src: "Cat", targetText: "" }
  ];
  const newTStrings: TDocString[] = [
    { id: 0, xpath: "", src: "Dog", targetText: "Chien" },
    { id: 1, xpath: "", src: "Cat", targetText: "Chat" }
  ];
  expect(tStringHistory([], oldTStrings, newTStrings)).toEqual([]);
});
