import React from "react";
import styled, { CSSProperties } from "styled-components";

interface HProps {
  level: number;
  text: string;
  style?: CSSProperties;
}

const StyledHeading = styled.h1<HProps>`
  font-size: ${props => (6 - props.level) * 0.5}em;
  margin: 0.6em 0;
`;

export default function Heading(props: HProps) {
  return <StyledHeading {...props}>{props.text}</StyledHeading>;
}
