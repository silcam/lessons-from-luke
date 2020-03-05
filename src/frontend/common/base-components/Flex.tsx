import styled from "styled-components";
import Div from "./Div";

interface FlexProps {
  flexZero?: boolean;
  flexRoot?: boolean;
  spaceBetween?: boolean;
  alignCenter?: boolean;
}

export const FlexCol = styled(Div)<FlexProps>`
  display: flex;
  flex-direction: column;
  flex-grow: ${props => (props.flexZero ? 0 : 1)};
  flex-shrink: ${props => (props.flexZero ? 0 : 1)};
  overflow: hidden;
  height: ${props => (props.flexRoot ? "100%" : "auto")};
  align-items: ${props => (props.alignCenter ? "center" : "stretch")};

  button {
    align-self: flex-start;
  }
`;

export const FlexRow = styled(Div)<FlexProps>`
  display: flex;
  flex-direction: row;
  justify-content: ${props =>
    props.spaceBetween ? "space-between" : "flex-start"};
  overflow: hidden;
  flex-grow: ${props => (props.flexZero ? 0 : 1)};
  flex-shrink: ${props => (props.flexZero ? 0 : 1)};
  height: ${props => (props.flexRoot ? "100%" : "auto")};
  align-items: ${props => (props.alignCenter ? "center" : "stretch")};
`;

// export const FlexFill = styled(Div)`
//   flex-grow: 1;
// `;
