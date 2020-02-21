import React from "react";
import styled from "styled-components";
import Button from "./Button";

interface IProps {
  value: number;
  setValue: (v: number) => void;
  minimum?: number;
  maximum?: number;
  noType?: boolean;
}

export default function NumberPicker(props: IProps) {
  const minValue = props.minimum === undefined ? 1 : props.minimum;
  const valueText = props.value >= minValue ? props.value.toString() : "";

  return (
    <NumberPickerDiv>
      <input
        type="text"
        value={valueText}
        onChange={e => props.setValue(parseInt(e.target.value) || 0)}
        size={2}
        disabled={!!props.noType}
      />
      <Button
        onClick={() => props.setValue(props.value - 1)}
        disabled={props.value <= minValue}
        text="-"
      />
      <Button
        onClick={() => props.setValue(props.value + 1)}
        disabled={props.maximum !== undefined && props.value >= props.maximum}
        text="+"
      />
    </NumberPickerDiv>
  );
}

const NumberPickerDiv = styled.div`
  display: inline-block;

  input {
    font-size: 1em;
    text-align: end;
  }

  button {
    width: 20px;
    height: 20px;
    box-sizing: border-box;
    border-radius: 100%;
    padding: 0 0 2px;
    line-height: 1;
    margin: 2px;
  }
`;
