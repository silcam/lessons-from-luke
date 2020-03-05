import React from "react";
import styled from "styled-components";
import Colors from "../util/Colors";
import Button from "./Button";

interface IProps {
  plus: boolean;
  setPlus: (plus: boolean) => void;
}

export default function PlusMinusButton(props: IProps) {
  return (
    <StyledPMButton
      onClick={() => props.setPlus(!props.plus)}
      text={props.plus ? "+" : "-"}
    />
  );
}

const StyledPMButton = styled(Button)`
  color: ${Colors.lightGrey};
  background-color: inherit;
  margin: 0;
  padding: 0;
  border: none;
  font-size: 1.5em;
  font-weight: bold;
  cursor: pointer;
  width: 1.5em;
  align-self: flex-start;

  &:hover,
  &:focus,
  &:active {
    background-color: inherit;
  }
`;
