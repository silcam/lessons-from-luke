import React, { createRef, useEffect } from "react";
import styled, { css } from "styled-components";
import Colors from "../util/Colors";

interface STAProps {}

interface IProps extends STAProps {
  placeholder?: string;
  value: string;
  setValue: (v: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
}

const StyledTextArea = styled.textarea<STAProps>`
  border: 1px ${Colors.lightGrey} solid;
  font-family: inherit;
  font-size: 1em;
  padding: 0.125em 0.25em;
  display: block;
  width: 100%;
  box-sizing: border-box;
  resize: none;

  &:focus {
    border-color: ${Colors.primary};
    outline: none;
  }
`;

export default function TextArea(props: IProps) {
  const { setValue, ...inputProps } = props;
  const ref = createRef<HTMLTextAreaElement>();

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight + 2}px`;
    }
  });

  return (
    <StyledTextArea
      ref={ref}
      onChange={e => props.setValue(e.target.value)}
      {...inputProps}
    />
  );
}

interface SSTAProps extends IProps {
  status: "none" | "clean" | "dirty" | "working";
}
export const StatusfulTextArea = styled(TextArea)<SSTAProps>`
  ${props =>
    props.status == "none"
      ? ""
      : css`
          border-color: ${(props: SSTAProps) =>
            props.status == "clean" ? Colors.success : Colors.warning};
        `}
`;
