import React, { useState, useEffect, ComponentProps } from "react";
import styled, { css } from "styled-components";
import TextArea from "./TextArea";
import Colors from "../util/Colors";

interface IProps extends ComponentProps<"textarea"> {
  value: string;
  saveValue: (v: string) => Promise<boolean>;
  markDirty: () => void;
  markClean: () => void;
  saveOnEnter?: () => void;
}

export default function StatusfulTextArea(props: IProps) {
  const { value, saveValue, markDirty, markClean, ...otherProps } = props;

  const [inputState, setInputState] = useState<
    "none" | "clean" | "dirty" | "working"
  >("none");

  const [text, _setText] = useState(props.value);
  const setText = (text: string) => {
    setInputState("dirty");
    _setText(text);
  };

  const save = async () => {
    if (inputState == "none") return;

    setInputState("working");
    const success = await saveValue(text);
    // setInputState(success ? "clean" : "dirty");
  };

  useEffect(() => {
    // Change of props value
    if (["dirty", "working"].includes(inputState)) setInputState("clean");
  }, [props.value]);

  useEffect(() => {
    if (inputState == "dirty") props.markDirty();
    if (inputState == "clean") props.markClean();
  }, [inputState]);

  return (
    <SSTA
      {...otherProps}
      value={["none", "clean"].includes(inputState) ? props.value : text}
      setValue={setText}
      status={inputState}
      onBlur={save}
      onKeyDown={e => {
        if (e.key == "Enter" && props.saveOnEnter) {
          e.preventDefault();
          save();
          props.saveOnEnter();
        }
      }}
    />
  );
}

interface SSTAProps extends ComponentProps<"textarea"> {
  status: "none" | "clean" | "dirty" | "working";
}
export const SSTA = styled(TextArea)<SSTAProps>`
  ${props =>
    props.status == "none"
      ? ""
      : css`
          border-color: ${(props: SSTAProps) =>
            props.status == "clean" ? Colors.success : Colors.warning};
        `}
`;
