import styled from "styled-components";
import { CSSProperties } from "react";

interface IProps {
  pad?: boolean;
  padVert?: boolean;
  marginBelow?: boolean;
  marginRight?: boolean;
  style?: CSSProperties;
}

const Div = styled.div<IProps>`
  padding: ${props => (props.pad ? "1em" : props.padVert ? "1em 0" : 0)};
  margin-bottom: ${props => (props.marginBelow ? "1em" : 0)};
  margin-right: ${props => (props.marginRight ? "0.7em" : 0)};
`;

export default Div;
