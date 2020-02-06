import styled from "styled-components";
import { CSSProperties } from "react";

interface IProps {
  pad?: boolean;
  marginBelow?: boolean;
  style?: CSSProperties;
}

const Div = styled.div<IProps>`
  padding: ${props => (props.pad ? "1em" : 0)};
  margin-bottom: ${props => (props.marginBelow ? "1em" : 0)};
`;

export default Div;
