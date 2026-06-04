import React, { useState, useEffect } from "react";
import styled from "styled-components";
import Colors from "../util/Colors";
import { FlexColBase } from "./Flex";

const ContainerDiv = styled(FlexColBase)`
  position: relative;
`;

const Bouncy = styled.span<React.HTMLAttributes<HTMLSpanElement>>`
  position: absolute;
  color: ${Colors.primary};
  font-weight: bold;
`;

const colorOptions = [
  Colors.primary,
  Colors.primary,
  Colors.success,
  Colors.danger,
  Colors.highlight
];
const numberOfDots = 20;
const defaults = new Array(numberOfDots).fill(50);
const diff = 4;
export default function LoadingSnake() {
  const [vals, setVals] = useState<[number, number][]>(
    defaults.map(d => [d, d])
  );
  const [colors, setColors] = useState(
    new Array(numberOfDots).fill(colorOptions[0])
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setVals(newValues(vals));
      setColors(nextColors(colors));
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  });

  return (
    <ContainerDiv>
      {vals.map((val, index) => (
        <Bouncy
          key={index}
          style={{
            left: `${val[0]}%`,
            top: `${val[1]}%`,
            color: colors[index]
          }}
        >
          o
        </Bouncy>
      ))}
    </ContainerDiv>
  );
}

function newValues(values: [number, number][]): [number, number][] {
  const current = values[0];
  let options: [number, number][] = [];
  for (let left = -1; left <= 1; ++left) {
    for (let top = -1; top <= 1; ++top) {
      const option: [number, number] = [
        left * diff + current[0],
        top * diff + current[1]
      ];

      if (
        !values.some(point => point[0] == option[0] && point[1] == option[1]) &&
        option[0] > 0 &&
        option[1] > 0 &&
        option[0] < 100 &&
        option[1] < 100
      )
        options.push(option);
    }
  }
  if (options.length == 0) return defaults.map(d => [d, d]);

  const picked = options[Math.floor(Math.random() * options.length)];
  return [picked, ...values.slice(0, values.length - 1)];
}

function nextColors(colors: string[]) {
  const newColor =
    colorOptions[Math.floor(Math.random() * colorOptions.length)];
  return [newColor, ...colors.slice(0, colors.length - 1)];
}
