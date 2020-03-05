import React from "react";
import styled from "styled-components";
import Colors from "../util/Colors";
import Div from "./Div";

interface StyleProps {
  noBorders?: boolean;
  hoverStriping?: boolean;
  noXPad?: boolean;
}

interface IProps<T> extends StyleProps {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  itemKey?: (item: T) => string | number;
}

export default function List<T>(props: IProps<T>) {
  const { items, renderItem, itemKey, ...styleProps } = props;
  return (
    <Div>
      {items.map((item, index) => (
        <ListItem key={itemKey ? itemKey(item) : index} {...styleProps}>
          {renderItem(item)}
        </ListItem>
      ))}
    </Div>
  );
}

const ListItem = styled.div<StyleProps>`
  border-bottom: ${props =>
    props.noBorders ? "none" : `1px solid ${Colors.lightGrey}`};
  padding: ${props => (props.noXPad ? "0.5em 0" : "0.5em 1em")};

  &:first-child {
    border-top: ${props =>
      props.noBorders ? "none" : `1px solid ${Colors.lightGrey}`};
  }

  &:hover {
    background-color: ${props => (props.hoverStriping ? "#efefef" : "inherit")};
  }
`;
