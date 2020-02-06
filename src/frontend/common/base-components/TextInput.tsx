import React from "react";
import styled, { css } from "styled-components";
import Colors from "../util/Colors";

interface STIProps {}

interface IProps extends STIProps {
  placeholder?: string;
  value: string;
  setValue: (v: string) => void;
  onBlur?: () => void;
  password?: boolean;
  autoFocus?: boolean;
}

const StyledTextInput = styled.input<STIProps>`
  border: none;
  border-bottom: 1px ${Colors.lightGrey} solid;
  font-size: 1em;
  padding: 0.125em 0.25em;
  display: block;
  width: 100%;
  box-sizing: border-box;

  &:focus {
    border-color: ${Colors.primary};
    outline: none;
  }
`;

export default function TextInput(props: IProps) {
  const { setValue, password, ...inputProps } = props;
  return (
    <StyledTextInput
      type={props.password ? "password" : "text"}
      onChange={e => props.setValue(e.target.value)}
      {...inputProps}
    />
  );
}

interface SSTIProps extends IProps {
  status: "none" | "clean" | "dirty" | "working";
}
export const StatusfulTextInput = styled(TextInput)<SSTIProps>`
  ${props =>
    props.status == "none"
      ? ""
      : css`
          border-color: ${(props: SSTIProps) =>
            props.status == "clean" ? Colors.success : Colors.warning};
        `}
`;
