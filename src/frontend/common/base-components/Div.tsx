import styled from "styled-components";
import { CSSProperties } from "react";

interface IProps {
  pad?: boolean;
  padVert?: boolean;
  marginBelow?: boolean;
  style?: CSSProperties;
}

const Div = styled.div<IProps>`
  padding: ${props => (props.pad ? "1em" : props.padVert ? "1em 0" : 0)};
  margin-bottom: ${props => (props.marginBelow ? "1em" : 0)};
`;

export default Div;
