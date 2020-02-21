import React, { PropsWithChildren } from "react";
import styled from "styled-components";

const StyledLabel = styled.label`
  font-weight: 200;
  display: block;

  span:first-child {
    margin-right: 1em;
  }
`;

interface IProps {
  text: string;
}

export default function Label(props: PropsWithChildren<IProps>) {
  return (
    <StyledLabel>
      <span>{props.text}</span>
      {props.children}
    </StyledLabel>
  );
}
