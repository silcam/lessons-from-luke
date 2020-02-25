import React from "react";
import styled from "styled-components";
import Colors from "../util/Colors";

interface SpanProps {
  motherTongue?: boolean;
}

const StyledSpan = styled.span<SpanProps>`
  font-weight: ${props => (props.motherTongue ? "bold" : "normal")};
  padding: 1px;
  background-color: ${props =>
    props.motherTongue ? Colors.warning : "inherit"};
`;

export default function TStringSpan(props: {
  text?: string;
  motherTongue?: boolean;
}) {
  return (
    <StyledSpan motherTongue={props.motherTongue}>{props.text}</StyledSpan>
  );
}
