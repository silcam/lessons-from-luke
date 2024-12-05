import React from "react";
import Div from "./Div";
import P from "./P";
import Label from "./Label";

interface IProps {
  buttonLabels: string[];
  radioName: string;
  defaultCheckedValue: string;
  label: string;
  setValue: (val: string) => void;
}

export default function RadioButtons(props: IProps) {
  return (
    <Div key="div-radio-buttons" pad>
      {props.label}
      {props.buttonLabels.map((l: string) => (
        <Div key={`div-label-radio-${l}`}>
          <Label key={`label-radio-${l}`} childrenFirst text={l}>
            <input 
              key={`radio-${l}`}
              type="radio"
              name={props.radioName}
              value={l}
              checked={props.defaultCheckedValue === l}
              onChange={e => props.setValue(e.target.value)} 
            />
          </Label>
        </Div>
      ))}
    </Div>
  );
}
