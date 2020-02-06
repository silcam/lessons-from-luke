import React from "react";
import styled from "styled-components";
import Colors from "../util/Colors";
import Div from "./Div";

interface IProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  itemKey?: (item: T) => string | number;
}

export default function List<T>(props: IProps<T>) {
  return (
    <Div>
      {props.items.map((item, index) => (
        <ListItem key={props.itemKey ? props.itemKey(item) : index}>
          {props.renderItem(item)}
        </ListItem>
      ))}
    </Div>
  );
}

const ListItem = styled.div`
  border-bottom: 1px solid ${Colors.lightGrey};
  padding: 0.5em 1em;

  &:first-child {
    border-top: 1px solid ${Colors.lightGrey};
  }
`;
