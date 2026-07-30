import styled, { css } from "styled-components";
import Div from "./Div";

// Buttons are sized by their own padding, so keep the flex line from stretching
// them to the full cross-axis extent. Scoped to direct children on purpose: as a
// descendant selector this reached into nested flex containers (a dialog button
// row, an action group) and overrode the alignment those containers set for
// themselves.
const DontStretchButtons = css`
  & > button {
    align-self: flex-start;
  }
`;

export interface FlexProps {
  flexZero?: boolean;
  flexRoot?: boolean;
  spaceBetween?: boolean;
  alignCenter?: boolean;
}

// Cast Div through 'any' to avoid TS2615 circular type inference with styled-components v5 + TypeScript 5.x
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DivBase = Div as any;

export const FlexCol = styled(DivBase)<FlexProps>`
  display: flex;
  flex-direction: column;
  flex-grow: ${(props) => (props.flexZero ? 0 : 1)};
  flex-shrink: ${(props) => (props.flexZero ? 0 : 1)};
  overflow: hidden;
  height: ${(props) => (props.flexRoot ? "100%" : "auto")};
  align-items: ${(props) => (props.alignCenter ? "center" : "stretch")};

  ${DontStretchButtons}
`;

export const FlexRow = styled(DivBase)<FlexProps>`
  display: flex;
  flex-direction: row;
  justify-content: ${(props) => (props.spaceBetween ? "space-between" : "flex-start")};
  overflow: hidden;
  flex-grow: ${(props) => (props.flexZero ? 0 : 1)};
  flex-shrink: ${(props) => (props.flexZero ? 0 : 1)};
  height: ${(props) => (props.flexRoot ? "100%" : "auto")};
  align-items: ${(props) => (props.alignCenter ? "center" : "stretch")};

  ${DontStretchButtons}
`;

// export const FlexFill = styled(Div)`
//   flex-grow: 1;
// `;

// Typed casts for use in styled(FlexColBase) / styled(FlexRowBase) to avoid TS2615 in TypeScript 5.x
export const FlexColBase = FlexCol as any; // eslint-disable-line @typescript-eslint/no-explicit-any
export const FlexRowBase = FlexRow as any; // eslint-disable-line @typescript-eslint/no-explicit-any
