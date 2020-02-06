import React from "react";
import styled, { css } from "styled-components";
import Colors, { faded, darker } from "../util/Colors";

interface SBProps {
  red?: boolean;
  bigger?: boolean;
  unButton?: boolean;
}

interface IProps extends SBProps {
  onClick: () => void;
  text: string;
  link?: boolean;
}

const StyledButton = styled.button<SBProps>`
  color: white;
  background-color: ${props => (props.red ? Colors.danger : Colors.primary)};
  font-size: ${props => (props.bigger ? "1.3em" : "1em")};
  border-width: 0;
  border-radius: 0.25em;
  padding: 0.5em 1em;
  margin: 0.25em;
  cursor: pointer;

  &:active {
    background-color: ${props =>
      darker(props.red ? Colors.danger : Colors.primary)};
  }

  &:active:focus {
    outline: none;
  }

  &:disabled {
    cursor: default;
    background-color: ${props =>
      faded(props.red ? Colors.danger : Colors.primary)};
  }
`;

const LinkStyledButton = styled.button<SBProps>`
  color: ${props => (props.red ? Colors.danger : Colors.primary)};
  font-size: ${props => (props.bigger ? "1.3em" : "1em")};
  background-color: inherit;
  border: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }

  &:active {
    color: ${props => darker(props.red ? Colors.danger : Colors.primary)};
  }

  ${props => (props.unButton ? UnButton : "")}
`;

const UnButton = css`
  color: inherit;
  background-color: inherit;
  cursor: default;

  &:hover {
    text-decoration: none;
  }

  &:active {
    color: inherit;
    background-color: inherit;
  }

  &:disabled {
    background-color: inherit;
  }
`;

export default function Button(props: IProps) {
  const { text, link, ...sbProps } = props;
  const SButton = link ? LinkStyledButton : StyledButton;
  return (
    <SButton
      onMouseUp={e => (e.target as HTMLButtonElement).blur()}
      disabled={sbProps.unButton}
      {...sbProps}
    >
      {text}
    </SButton>
  );
}
