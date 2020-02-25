import React, { useState } from "react";
import styled from "styled-components";
import { DocString } from "../../../core/models/DocString";
import TStringSpan from "../../common/base-components/TStringSpan";
import Button from "../../common/base-components/Button";
import { FlexRow } from "../../common/base-components/Flex";
import useTranslation from "../../common/util/useTranslation";
import Div from "../../common/base-components/Div";
import TextArea from "../../common/base-components/TextArea";
import Colors from "../../common/util/Colors";

interface IProps {
  docString: DocString;
  lastString?: boolean;
  setText: (text: string) => void;
  deleteItem: () => void;
  mergeNext: (sep: string) => void;
}

export default function LessonStringEditor(props: IProps) {
  const t = useTranslation();
  const docString = props.docString;
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(docString.text);

  return editing ? (
    <LSEdDiv>
      <TextArea value={draftText} setValue={setDraftText} />
      <Div>
        <Button
          text={t("Ok")}
          onClick={() => {
            draftText.length > 0
              ? props.setText(draftText)
              : props.deleteItem();
            setEditing(false);
          }}
        />
        <Button red text={t("Cancel")} onClick={() => setEditing(false)} />
      </Div>
    </LSEdDiv>
  ) : (
    <LSEdDiv>
      <TStringSpan {...docString} />
      <FlexRow className="buttonRow">
        {!props.lastString && (
          <React.Fragment>
            <Button
              link
              text={t("Merge_next")}
              onClick={() => props.mergeNext("")}
            />
            <Button
              link
              text={t("Merge_next_with_space")}
              onClick={() => props.mergeNext(" ")}
            />
          </React.Fragment>
        )}
        <Button
          link
          text={t("Edit")}
          onClick={() => {
            setDraftText(docString.text);
            setEditing(true);
          }}
        />
        <Button red link text={t("Delete")} onClick={props.deleteItem} />
      </FlexRow>
    </LSEdDiv>
  );
}

const LSEdDiv = styled.div`
  border-bottom: 1px ${Colors.lightGrey} solid;
  padding: 0.5em 0.25em;

  .buttonRow {
    margin-top: 0.5em;
    height: 1.2em;
  }

  .buttonRow button {
    display: none;
  }

  /* &:hover {
    background-color: ${Colors.lightGrey};
  } */

  &:hover .buttonRow button {
    display: inline-block;
  }
`;

// const ButtonRow = styled.div`
//   display: flex;
//   flex-direction: row;
//   height: 1.3em;

//   button {
//     display: none;
//   }

//   ${LSEdDiv}:hover & button {
//     display: inline-block;
//   }
// `;
