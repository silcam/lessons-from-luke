import React from "react";
import Label from "./Label";

interface IProps {
  label: string;
  value: boolean;
  setValue: (val: boolean) => void;
  disabled?: boolean;
}

export default function Checkbox(props: IProps) {
  return (
    <Label childrenFirst text={props.label}>
      <input
        type="checkbox"
        checked={props.value}
        disabled={props.disabled}
        onChange={(e) => props.setValue(e.target.checked)}
      />
    </Label>
  );
}
