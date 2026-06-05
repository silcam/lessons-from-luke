import React, { useState, useEffect, useRef, ComponentProps } from "react";
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
  const {
    value: _value,
    saveValue,
    markDirty: _markDirty,
    markClean: _markClean,
    ...otherProps
  } = props;

  const [inputState, setInputState] = useState<"none" | "clean" | "dirty" | "working">("none");

  const [text, _setText] = useState(props.value);
  const setText = (text: string) => {
    setInputState("dirty");
    _setText(text);
  };

  const save = async () => {
    if (inputState == "none") return;
    if (!text.trim()) return;

    setInputState("working");
    await saveValue(text);
    // setInputState(success ? "clean" : "dirty");
  };

  const latestRef = useRef({ inputState, text, saveValue });
  useEffect(() => {
    latestRef.current = { inputState, text, saveValue };
  });

  useEffect(() => {
    return () => {
      if (latestRef.current.inputState === "dirty") {
        latestRef.current.saveValue(latestRef.current.text);
      }
    };
  }, []);

  useEffect(() => {
    // Change of props value
    // reconcile internal status to external value change; cascading render intended
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (["dirty", "working"].includes(inputState)) setInputState("clean");
    // only re-run when the external value changes; inputState is read but not tracked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);

  useEffect(() => {
    if (inputState == "dirty") props.markDirty();
    if (inputState == "clean") props.markClean();
    // markDirty/markClean callbacks intentionally not tracked — fire only on state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputState]);

  return (
    <SSTA
      {...otherProps}
      value={["none", "clean"].includes(inputState) ? props.value : text}
      setValue={setText}
      status={inputState}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key == "Enter" && props.saveOnEnter) {
          e.preventDefault();
          save();
          props.saveOnEnter();
        }
      }}
      commonSubs
    />
  );
}

interface SSTAProps extends ComponentProps<"textarea"> {
  status: "none" | "clean" | "dirty" | "working";
}
export const SSTA = styled(TextArea)<SSTAProps>`
  ${(props) =>
    props.status == "none"
      ? ""
      : css`
          border-color: ${(props: SSTAProps) =>
            props.status == "clean" ? Colors.success : Colors.warning};
        `}
`;
