import React from "react";
import Label from "./Label";

interface IProps {
  label: string;
  value: boolean;
  setValue: (val: boolean) => void;
}

export default function Checkbox(props: IProps) {
  return (
    <Label childrenFirst text={props.label}>
      <input
        type="checkbox"
        checked={props.value}
        onChange={e => props.setValue(e.target.checked)}
      />
    </Label>
  );
}
