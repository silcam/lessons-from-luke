import React, { PropsWithChildren } from "react";
import styled from "styled-components";
import Colors from "../util/Colors";

interface StyleProps {
  borders?: boolean;
}

const STable = styled.table<StyleProps>`
  border-collapse: collapse;

  td {
    padding: 0.3em 0.7em;
    border-width: ${props => (props.borders ? "1px" : "0")};
    border-style: solid;
    border-color: ${Colors.lightGrey};
  }
`;

interface IProps extends StyleProps {}

export default function Table(props: PropsWithChildren<IProps>) {
  return (
    <STable {...props}>
      <tbody>{props.children}</tbody>
    </STable>
  );
}
