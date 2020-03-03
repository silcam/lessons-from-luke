import React from "react";
import styled from "styled-components";
import Colors from "../util/Colors";

interface IProps {
  percent: number;
}

const ProgressBarContainer = styled.div<IProps>`
  background-color: ${Colors.lightGrey};
  height: 2px;
  width: 100%;

  .bar {
    background-color: ${props =>
      props.percent == 100 ? Colors.success : Colors.warning};
    height: 100%;
    width: ${props => props.percent}%;
  }
`;

export default function ProgressBar(props: IProps) {
  return (
    <ProgressBarContainer {...props}>
      <div className="bar" />
    </ProgressBarContainer>
  );
}
