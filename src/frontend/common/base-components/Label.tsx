import React, { PropsWithChildren } from "react";
import styled from "styled-components";

const StyledLabel = styled.label`
  font-weight: 200;
  display: block;
`;

const SpacedSpan = styled.span`
  margin-right: 1em;
`;

interface IProps {
  text: string;
  childrenFirst?: boolean;
}

export default function Label(props: PropsWithChildren<IProps>) {
  return props.childrenFirst ? (
    <StyledLabel>
      {props.children}
      <span>{props.text}</span>
    </StyledLabel>
  ) : (
    <StyledLabel>
      <SpacedSpan>{props.text}</SpacedSpan>
      {props.children}
    </StyledLabel>
  );
}
