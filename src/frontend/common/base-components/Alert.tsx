import React from "react";
import styled from "styled-components";
import Colors from "../util/Colors";

interface IProps extends React.HTMLAttributes<HTMLDivElement> {
  danger?: boolean;
  success?: boolean;
  warning?: boolean;
  children?: React.ReactNode;
}

const borderColor = (props: IProps) =>
  props.danger
    ? Colors.danger
    : props.success
      ? Colors.success
      : props.warning
        ? Colors.warning
        : Colors.highlight;

// The state hue carries meaning on the 2px border. For text color, only danger
// (#d00000) clears WCAG AA on white; success green and highlight amber do not,
// so the success and warning variants use ink and let the border signal the
// state (border + message text together — never color alone).
const Alert = styled.div<IProps>`
  border-style: solid;
  border-width: 2px;
  border-radius: 0.25em;
  padding: 0.5em 1em;
  margin: 0.5em 0;
  border-color: ${borderColor};
  color: ${(props) =>
    props.danger ? Colors.danger : props.success || props.warning ? "inherit" : Colors.highlight};
`;

export default Alert;
