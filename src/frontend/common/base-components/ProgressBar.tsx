import React from "react";
import styled from "styled-components";
import Colors from "../util/Colors";

interface IProps {
  percent: number;
  fixed?: boolean;
}

const ProgressBarContainer = styled.div<IProps>`
  background-color: ${Colors.lightGrey};
  height: ${props => (props.fixed ? "6px" : "2px")};
  width: ${props => (props.fixed ? "100px" : "100%")};

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
