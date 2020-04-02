import React from "react";
import styled from "styled-components";
import Colors from "../util/Colors";

interface STIProps {
  minWidth?: number;
  bigger?: boolean;
}

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
  font-size: ${props => (props.bigger ? "1.6em" : "1em")};
  margin: ${props => (props.bigger ? "0.4em 0 0.8em" : "0")};
  padding: 0.125em 0.25em;
  display: block;
  width: 100%;
  min-width: ${props => (props.minWidth ? `${props.minWidth}em` : undefined)};
  box-sizing: border-box;

  &:focus {
    border-color: ${Colors.primary};
    outline: none;
  }

  ::placeholder {
    color: ${Colors.grey};
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
