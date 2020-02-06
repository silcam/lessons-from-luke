import styled from "styled-components";
import Colors from "../util/Colors";

interface IProps {
  danger?: boolean;
}

const Alert = styled.div<IProps>`
  border-style: solid;
  border-width: 2px;
  border-radius: 0.25em;
  padding: 0.5em 1em;
  margin: 0.5em 0;
  border-color: ${props => (props.danger ? Colors.danger : Colors.highlight)};
  color: ${props => (props.danger ? Colors.danger : Colors.highlight)};
`;

export default Alert;
