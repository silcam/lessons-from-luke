import styled from "styled-components";
import Div from "./Div";

interface FlexProps {
  noFill?: boolean;
  flexRoot?: boolean;
}

export const FlexCol = styled(Div)<FlexProps>`
  display: flex;
  flex-direction: column;
  flex-grow: ${props => (props.noFill ? 0 : 1)};
  flex-shrink: ${props => (props.noFill ? 0 : 1)};
  overflow: hidden;
  height: ${props => (props.flexRoot ? "100%" : "auto")};

  button {
    align-self: flex-start;
  }
`;

export const FlexRow = styled(Div)<FlexProps>`
  display: flex;
  flex-direction: row;
  overflow: hidden;
  flex-grow: ${props => (props.noFill ? 0 : 1)};
  flex-shrink: ${props => (props.noFill ? 0 : 1)};
  height: ${props => (props.flexRoot ? "100%" : "auto")};
`;

// export const FlexFill = styled(Div)`
//   flex-grow: 1;
// `;
