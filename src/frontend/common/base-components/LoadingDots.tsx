import React, { useState, useEffect } from "react";
import { randInt } from "../../../core/util/numberUtils";
import Colors from "../util/Colors";
import styled from "styled-components";

interface IProps {
  size?: number;
}

const colorOptions = [
  Colors.primary,
  Colors.primary,
  Colors.success,
  Colors.danger,
  Colors.highlight
];

export default function LoadingDots(props: IProps) {
  const size = props.size || 5;
  const [dots, setDots] = useState(
    new Array(size).fill("").map(() => randomColor())
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDots([randomColor(), ...dots.slice(0, dots.length - 1)]);
    }, 150);
    return () => {
      clearTimeout(timer);
    };
  });

  return (
    <LoadingDotsDiv>
      {dots.map(color => (
        <span style={{ color }}>o</span>
      ))}
    </LoadingDotsDiv>
  );
}

function randomColor() {
  return colorOptions[randInt(colorOptions.length)];
}

const LoadingDotsDiv = styled.div`
  span {
    font-weight: bold;
  }
`;
