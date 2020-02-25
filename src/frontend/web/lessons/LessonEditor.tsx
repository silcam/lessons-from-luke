import React from "react";
import produce from "immer";
import { LessonTStrings } from "../../common/translate/useLessonTStrings";
import { DocString } from "../../../core/models/DocString";
import LessonStringEditor from "./LessonStringEditor";
import Div from "../../common/base-components/Div";

interface IProps {
  docStrings: DocString[];
  setDocStrings: (ds: DocString[]) => void;
}

export default function LessonEditor(props: IProps) {
  const { docStrings, setDocStrings } = props;

  const setText = (docStrings: DocString[], index: number, text: string) =>
    produce(docStrings, ds => {
      ds[index].text = text;
    });

  const deleteItem = (docStrings: DocString[], index: number) =>
    produce(docStrings, ds => {
      ds[index].text = "";
      ds.splice(0, 0, ds.splice(index, 1)[0]);
    });

  const mergeNext = (docStrings: DocString[], index: number, sep: string) =>
    deleteItem(
      setText(
        docStrings,
        index,
        docStrings[index].text + sep + docStrings[index + 1].text
      ),
      index + 1
    );

  return (
    <Div>
      {docStrings.map((docString, index) =>
        docString.text.length == 0 ? null : (
          <LessonStringEditor
            key={index}
            docString={docString}
            lastString={index == docStrings.length - 1}
            setText={text => setDocStrings(setText(docStrings, index, text))}
            deleteItem={() => setDocStrings(deleteItem(docStrings, index))}
            mergeNext={sep => setDocStrings(mergeNext(docStrings, index, sep))}
          />
        )
      )}
    </Div>
  );
}

export function docStringsFromLessonTStrings(
  lessonTStrings: LessonTStrings
): DocString[] {
  return lessonTStrings.map(ltStr => ({
    type: ltStr.lStr.type,
    xpath: ltStr.lStr.xpath,
    motherTongue: ltStr.lStr.motherTongue,
    text: ltStr.tStrs[0]?.text || ""
  }));
}
