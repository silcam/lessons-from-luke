import React, { useState, useEffect } from "react";
import Colors from "../util/Colors";
import styled from "styled-components";
import { randInt } from "../../../core/util/numberUtils";
import update from "immutability-helper";

interface IProps {
  size: number;
}

const colorOptions = [
  Colors.primary,
  Colors.primary,
  Colors.success,
  Colors.danger,
  Colors.highlight
];
type Box = (string | null)[][];

export default function LoadingBox(props: IProps) {
  const [box, setBox] = useState(initialBox(props.size));
  const fizz = Math.round((props.size * props.size) / 8);

  useEffect(() => {
    const timer = setTimeout(() => {
      let tmpBox = box;
      for (let i = 0; i < fizz; ++i) {
        const [x, y] = [randInt(props.size), randInt(props.size)];
        const newVal = box[x][y] ? null : randomColor();
        tmpBox = update(tmpBox, { [x]: { [y]: { $set: newVal } } });
      }
      setBox(tmpBox);
    }, 150);
    return () => clearTimeout(timer);
  });

  return (
    <LoadingBoxDiv>
      {box.map((row, x) => (
        <div key={x}>
          {row.map((color, y) => (
            <span
              key={y}
              style={{ color: color || "#ffffff00", fontWeight: "bold" }}
            >
              o
            </span>
          ))}
        </div>
      ))}
    </LoadingBoxDiv>
  );
}

function initialBox(size: number) {
  const box: Box = [];
  for (let x = 0; x < size; ++x) {
    const row: Box[number] = [];
    box.push(row);
    for (let y = 0; y < size; ++y) {
      row.push(Math.random() < 0.65 ? randomColor() : null);
    }
  }
  return box;
}

function randomColor() {
  return colorOptions[randInt(colorOptions.length)];
}

const LoadingBoxDiv = styled.div`
  span {
    font-weight: bold;
    padding: 0 1px;
  }
`;
