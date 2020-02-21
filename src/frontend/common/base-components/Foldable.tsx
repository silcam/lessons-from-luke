import React, { useState } from "react";
import styled from "styled-components";
import Div from "./Div";
import Colors from "../util/Colors";
import Heading from "./Heading";
import PlusMinusButton from "./PlusMinusButton";
import { FlexRow } from "./Flex";

interface IProps {
  startUnFolded?: boolean;
  folded?: boolean;
  setFolded?: (folded: boolean) => void;
  title: string;
  render: (folded: boolean) => JSX.Element | null;
}

export default function Foldable(props: IProps) {
  const [foldedState, setFoldedState] = useState(!props.startUnFolded);
  const folded = props.folded === undefined ? foldedState : props.folded;
  const setFolded = props.setFolded || setFoldedState;

  return (
    <FoldableDiv>
      <FlexRow>
        <PlusMinusButton plus={folded} setPlus={setFolded} />
        <Heading level={3} text={props.title} />
      </FlexRow>
      <Div pad>{props.render(folded)}</Div>
    </FoldableDiv>
  );
}

const FoldableDiv = styled.div`
  border: 1px solid ${Colors.lightGrey};
  border-radius: 8px;
  margin: 1em;
`;
