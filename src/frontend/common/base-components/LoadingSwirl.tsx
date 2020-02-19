import React, { useState, useEffect } from "react";
import styled from "styled-components";
import Colors from "../util/Colors";
import { FlexCol } from "./Flex";

const ContainerDiv = styled(FlexCol)`
  position: relative;
`;

const Bouncy = styled.span`
  position: absolute;
  color: ${Colors.primary};
  font-weight: bold;
`;

const angles = [-0.8, -0.5, -0.3, 0.3, 0.5, 0.8];
const colorOptions = [
  Colors.primary,
  Colors.primary,
  Colors.success,
  Colors.danger,
  Colors.highlight
];
const numberOfDots = 25;
const defaults = new Array(numberOfDots).fill(50);
const diff = 4;
export default function LoadingSwirl() {
  const [vals, setVals] = useState<[number, number][]>(
    defaults.map(d => [d, d])
  );
  const [angleDiff, setAngleDiff] = useState(-0.5);
  const [angle, setAngle] = useState(0);
  const [tick, setTick] = useState(0);
  const [colors, setColors] = useState(
    new Array(numberOfDots).fill(colorOptions[0])
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setVals(nextValues(vals, angle));
      setColors(nextColors(colors));
      setAngle(angle + angleDiff);
      setTick(tick + 1);
      if (tick % 8 == 0) {
        setAngleDiff(angles[Math.floor(Math.random() * angles.length)]);
      }
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  });

  return (
    <ContainerDiv>
      {vals.map((val, index) => (
        <Bouncy
          key={tick - index}
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

function nextValues(
  values: [number, number][],
  angle: number
): [number, number][] {
  const newVal = [
    diff * Math.cos(angle) + values[0][0],
    diff * Math.sin(angle) + values[0][1]
  ];
  const normalNewVal = newVal.map(val =>
    val < 0 ? val + 100 : val >= 100 ? val - 100 : val
  ) as [number, number];
  return [normalNewVal, ...values.slice(0, values.length - 1)];
}

function nextColors(colors: string[]) {
  const newColor =
    colorOptions[Math.floor(Math.random() * colorOptions.length)];
  return [newColor, ...colors.slice(0, colors.length - 1)];
}
