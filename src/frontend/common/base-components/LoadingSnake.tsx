import React, { useState, useEffect } from "react";
import styled from "styled-components";
import Colors from "../util/Colors";
import { randomSelection } from "../../../core/util/arrayUtils";
import { FlexCol } from "./Flex";

const ContainerDiv = styled(FlexCol)`
  position: relative;
`;

const Bouncy = styled.span`
  position: absolute;
  color: ${Colors.primary};
  font-weight: bold;
`;

const defaults = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50];
const diff = 4;
export default function LoadingSnake() {
  const [vals, setVals] = useState<[number, number][]>(
    defaults.map(d => [d, d])
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setVals(newValues(vals));
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  });

  return (
    <ContainerDiv>
      {vals.map((val, index) => (
        <Bouncy key={index} style={{ left: `${val[0]}%`, top: `${val[1]}%` }}>
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

  const picked = randomSelection(options, 1)[0];
  return [picked, ...values.slice(0, values.length - 1)];
}
