import React from "react";
import styled from "styled-components";
import { PropsWithChildren } from "react";

const GridContainer = styled.div<{ children?: React.ReactNode }>`
  display: grid;
  height: 100%;
  grid-template-rows: 1fr auto 3fr;
  grid-template-columns: 1fr auto 1fr;
  grid-template-areas:
    ". . ."
    ". content ."
    ". . .";
`;

const GridContent = styled.div<{ children?: React.ReactNode }>`
  grid-area: content;
`;

export default function MiddleOfPage(props: PropsWithChildren<{}>) {
  return (
    <GridContainer>
      <GridContent>{props.children}</GridContent>
    </GridContainer>
  );
}
