import React, { PropsWithChildren } from "react";
import styled from "styled-components";

interface StyleProps {}

const STable = styled.table`
  td {
    padding: 0.3em 0.7em;
  }
`;

interface IProps extends StyleProps {}

export default function Table(props: PropsWithChildren<IProps>) {
  return (
    <STable>
      <tbody>{props.children}</tbody>
    </STable>
  );
}
