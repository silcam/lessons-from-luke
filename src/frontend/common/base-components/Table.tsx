import React, { PropsWithChildren } from "react";
import styled from "styled-components";
import Colors from "../util/Colors";

interface StyleProps {
  borders?: boolean;
  /** Optional header row(s); rendered inside <thead>. Tables without it are unchanged. */
  header?: React.ReactNode;
  children?: React.ReactNode;
}

const STable = styled.table<StyleProps>`
  border-collapse: collapse;

  /* Scoped to thead so existing headerless tables keep their current look. */
  thead th {
    padding: 0.3em 0.7em;
    text-align: left;
    border-bottom: 1px solid ${Colors.lightGrey};
  }

  td {
    padding: 0.3em 0.7em;
    border-width: ${(props) => (props.borders ? "1px" : "0")};
    border-style: solid;
    border-color: ${Colors.lightGrey};
  }
`;

type IProps = StyleProps;

export default function Table(props: PropsWithChildren<IProps>) {
  const { header, children, ...rest } = props;
  return (
    <STable {...rest}>
      {header ? <thead>{header}</thead> : null}
      <tbody>{children}</tbody>
    </STable>
  );
}
