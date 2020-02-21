import React from "react";
import styled from "styled-components";
import Colors from "../util/Colors";

interface IProps {
  plus: boolean;
  setPlus: (plus: boolean) => void;
}

export default function PlusMinusButton(props: IProps) {
  return (
    <StyledPMButton onClick={() => props.setPlus(!props.plus)}>
      {props.plus ? "+" : "-"}
    </StyledPMButton>
  );
}

const StyledPMButton = styled.button`
  color: ${Colors.lightGrey};
  background-color: inherit;
  border: none;
  font-size: 1.5em;
  font-weight: bold;
  cursor: pointer;
  width: 1.5em;
  align-self: flex-start;
`;
