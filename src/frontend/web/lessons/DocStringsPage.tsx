import React, { useState, useRef } from "react";
import useTranslation from "../../common/util/useTranslation";
import { usePush } from "../../common/api/RequestContext";
import { useAppSelector } from "../../common/state/appState";
import { findBy } from "../../../core/util/arrayUtils";
import { Redirect, useHistory } from "react-router-dom";
import { StdHeaderBar } from "../../common/base-components/HeaderBar";
import { lessonName } from "../../../core/models/Lesson";
import { DocString } from "../../../core/models/DocString";
import styled from "styled-components";
import Colors from "../../common/util/Colors";
import useLessonTStrings, {
  LessonTString
} from "../../common/translate/useLessonTStrings";
import { ENGLISH_ID } from "../../../core/models/Language";
import Button from "../../common/base-components/Button";
import TextArea from "../../common/base-components/TextArea";
import P from "../../common/base-components/P";
import { FlexCol } from "../../common/base-components/Flex";
import Scroll from "../../common/base-components/Scroll";
import produce from "immer";
import { newTString } from "../../../core/models/TString";
import { pushTStrings } from "../../common/state/tStringSlice";

interface IProps {
  languageId: number;
  lessonId: number;
}

interface LessonDocStr {
  ltStr?: LessonTString;
  text?: string;
  flagged: boolean;
}

export default function DocStringsPage(props: IProps) {
  const t = useTranslation();
  const push = usePush();
  const history = useHistory();

  const language = useAppSelector(state =>
    findBy(state.languages.adminLanguages, "languageId", props.languageId)
  );
  const { lesson, lessonTStrings } = useLessonTStrings(
    props.lessonId,
    [ENGLISH_ID],
    { contentOnly: true }
  );
  const origDocStrings: DocString[] | undefined = useAppSelector(
    state =>
      state.docStrings[props.languageId] &&
      state.docStrings[props.languageId][props.lessonId]
  );

  const [texts, setTexts] = useState(
    origDocStrings?.filter(ds => ds.type == "content")?.map(ds => ds.text)
  );

  if (!language || !lesson || !origDocStrings) {
    console.log("Can't show docStrings");
    return <Redirect to="/" />;
  }

  const lessonDocStrings: LessonDocStr[] = [];
  for (let i = 0; i < Math.max(lessonTStrings.length, texts.length); ++i) {
    const lsnDocStr = {
      ltStr: lessonTStrings[i],
      text: texts[i],
      flagged: false
    };
    if (i > 0) {
      if (
        !lsnDocStr.ltStr ||
        !lsnDocStr.text ||
        // Check where ltStr text is same twice in a row, but translated texts don't match
        (lsnDocStr.ltStr.tStrs[0]?.text ==
          lessonDocStrings[i - 1].ltStr?.tStrs[0]?.text &&
          lsnDocStr.text != lessonDocStrings[i - 1].text)
      )
        lsnDocStr.flagged = true;
    }
    lessonDocStrings.push(lsnDocStr);
  }

  const split = (index: number, splitIndex: number) =>
    setTexts(
      produce(texts, texts => {
        const text = texts[index];
        texts[index] = text.slice(0, splitIndex);
        texts.splice(index + 1, 0, text.slice(splitIndex));
      })
    );

  const merge = (index: number, sep: string) =>
    setTexts(
      produce(texts, texts => {
        const mergeWith = texts[index + 1] || "";
        texts[index] = texts[index] + sep + mergeWith;
        texts.splice(index + 1, 1);
      })
    );

  const edit = (index: number, text: string) =>
    setTexts(
      produce(texts, texts => {
        texts[index] = text;
      })
    );

  const save = async () => {
    const tStrings = lessonDocStrings
      .filter(lsnDocStr => lsnDocStr.ltStr && lsnDocStr.text)
      .map(lsnDocStr =>
        newTString(
          lsnDocStr.text!,
          lsnDocStr.ltStr!.lStr,
          language,
          lsnDocStr.ltStr!.tStrs[0]
        )
      );
    const result = await push(pushTStrings(tStrings, language));
    if (result) history.push("/");
  };

  return (
    <FlexCol flexRoot>
      <StdHeaderBar
        title={`${language.name} ${lessonName(lesson)}`}
        renderRight={() => <Button text={t("Save")} onClick={save} />}
      />
      <Scroll>
        <LsnDocStrTable>
          <tbody>
            {lessonDocStrings.map((lsnDocStr, index) => (
              <LessonDocStringTR
                lessonDocStr={lsnDocStr}
                key={index}
                split={splitIndex => split(index, splitIndex)}
                mergeNext={sep => merge(index, sep)}
                edit={text => edit(index, text)}
              />
            ))}
          </tbody>
        </LsnDocStrTable>
      </Scroll>
    </FlexCol>
  );
}

function LessonDocStringTR(props: {
  lessonDocStr: LessonDocStr;
  mergeNext: (sep: string) => void;
  split: (index: number) => void;
  edit: (text: string) => void;
}) {
  const t = useTranslation();
  const lsnDocStr = props.lessonDocStr;
  const [splitting, setSplitting] = useState(false);
  const [draftText, setDraftText] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  return (
    <tr className={lsnDocStr.flagged ? "flagged" : ""}>
      <td>{lsnDocStr.ltStr?.tStrs[0]?.text}</td>
      <td>
        {splitting ? (
          <div>
            <TextArea
              taRef={ref}
              value={lsnDocStr.text || ""}
              setValue={() => {}} // The text is not editable
            />
            <P subdued>{t("Split_instructions")}</P>
            <Button
              text={t("Split")}
              onClick={() => {
                if (ref.current) {
                  props.split(ref.current.selectionStart);
                  setSplitting(false);
                }
              }}
            />
            <Button
              red
              text={t("Cancel")}
              onClick={() => setSplitting(false)}
            />
          </div>
        ) : draftText !== null ? (
          <div>
            <TextArea value={draftText} setValue={setDraftText} />
            <Button
              text={t("Ok")}
              onClick={() => {
                props.edit(draftText);
                setDraftText(null);
              }}
            />
            <Button red text={t("Cancel")} onClick={() => setDraftText(null)} />
          </div>
        ) : (
          <React.Fragment>
            {lsnDocStr.text}
            {lsnDocStr.text !== undefined && (
              <div className="buttonRow">
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
                <Button
                  link
                  text={t("Split")}
                  onClick={() => setSplitting(true)}
                />
                <Button
                  link
                  text={t("Edit")}
                  onClick={() => setDraftText(lsnDocStr.text!)}
                />
              </div>
            )}
          </React.Fragment>
        )}
      </td>
    </tr>
  );
}

const LsnDocStrTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  tr.flagged {
    color: ${Colors.danger};
  }

  td {
    border: 1px solid ${Colors.lightGrey};
    padding: 0.5em;
    vertical-align: top;

    .buttonRow {
      margin-top: 0.5em;
      height: 1.2em;

      button {
        display: none;
        margin: 0 0.5em;
      }
    }

    &:hover .buttonRow button {
      display: inline-block;
    }
  }
`;
