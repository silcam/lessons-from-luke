import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import { pushTStrings } from "../state/tStringSlice";
import { BaseLesson } from "../../../core/models/Lesson";
import Div from "../base-components/Div";
import { LessonTString } from "./useLessonTStrings";
import Label from "../base-components/Label";
import useTranslation from "../util/useTranslation";
import SelectInput from "../base-components/SelectInput";
import { useAppSelector } from "../state/appState";
import DocPreview from "./DocPreview";
import useDirtyState from "./useDirtyState";
import { FlexCol, FlexRow } from "../base-components/Flex";
import Scroll from "../base-components/Scroll";
import Button from "../base-components/Button";
import usePreviewScroll from "./usePreviewScroll";
import StatusfulTextArea from "../base-components/StatusfulTextArea";
import { newTString } from "../../../core/models/TString";
import { useNetworkConnectionRestored } from "../state/networkSlice";
import { usePush } from "../api/useLoad";
import TStringHistoryView from "./TStringHistoryView";
import { discriminate } from "../../../core/util/arrayUtils";

interface IProps {
  lesson: BaseLesson;
  lessonTStrings: LessonTString[];
  language: Language;
  srcLangId: number;
  setSrcLangId: (id: number) => void;
  onDirtyStateChange: (dirty: boolean) => void;
  docHtml: string;
}

export default function TranslateWithPreview(props: IProps) {
  const t = useTranslation();
  const push = usePush();
  const { onConnectionRestored } = useNetworkConnectionRestored();

  const languages = useAppSelector(state => state.languages.languages);
  const { setDirty, setClean } = useDirtyState(props.onDirtyStateChange);

  const [index, setIndex] = useState(0);
  const [ltStringsForTranslation, otherLTStrings] = discriminate(
    props.lessonTStrings,
    ltStr => !props.language.motherTongue || ltStr.lStr.motherTongue
  );
  const selectedLTStr: LessonTString | undefined =
    ltStringsForTranslation[index];
  const scrollDivRef = usePreviewScroll(selectedLTStr);

  const save = async (text: string) => {
    const ltStr = selectedLTStr;
    const savedStr = await push(
      pushTStrings(
        [newTString(text, ltStr.lStr, props.language, ltStr.tStrs[0])],
        props.language
      ),
      err => {
        if (err.type == "No Connection") onConnectionRestored(() => save(text));
        return false;
      }
    );
    if (savedStr) setClean(ltStr.lStr.lessonStringId);
    return !!savedStr;
  };

  return (
    <FlexRow>
      <FlexCol pad style={{ minWidth: "200px" }}>
        <Label text={t("Source_language")}>
          <SelectInput
            value={`${props.srcLangId}`}
            setValue={v => props.setSrcLangId(parseInt(v))}
            options={languages.map(lng => [`${lng.languageId}`, lng.name])}
          />
        </Label>
        {selectedLTStr && (
          <Div>
            <Button
              text="<<"
              onClick={() => setIndex(index - 1)}
              disabled={index == 0}
            />
            <Button
              text=">>"
              onClick={() => setIndex(index + 1)}
              disabled={index >= ltStringsForTranslation.length - 1}
            />
            {selectedLTStr.tStrs[1] && (
              <Button
                text=">>>"
                onClick={() => {
                  const goToIndex = ltStringsForTranslation.findIndex(
                    (ltStr, i) => i > index && !ltStr.tStrs[1]
                  );
                  setIndex(
                    goToIndex >= 0
                      ? goToIndex
                      : ltStringsForTranslation.length - 1
                  );
                }}
              />
            )}
            <p>{selectedLTStr.tStrs[0]?.text}</p>
            <StatusfulTextArea
              key={selectedLTStr.lStr.lessonStringId}
              value={selectedLTStr.tStrs[1]?.text || ""}
              saveValue={save}
              markClean={() => setClean(selectedLTStr.lStr.lessonStringId)}
              markDirty={() => setDirty(selectedLTStr.lStr.lessonStringId)}
              placeholder={props.language.name}
              autoFocus
              saveOnEnter={() => {
                if (index < ltStringsForTranslation.length - 1)
                  setIndex(index + 1);
              }}
            />
            <Button
              text={t("Save")}
              onClick={() => {
                /* No logic needed since save happens whenenver the text box loses focus. */
              }}
            />
            <TStringHistoryView tString={selectedLTStr.tStrs[1]} />
          </Div>
        )}
      </FlexCol>
      <Scroll ref={scrollDivRef} flexZero>
        <DocPreview
          lessonId={props.lesson.lessonId}
          srcLangId={props.srcLangId}
          targetLangId={props.language.languageId}
          docHtml={props.docHtml}
          ltStringsForTranslation={ltStringsForTranslation}
          otherLTStrings={otherLTStrings}
          setSelectedIndex={setIndex}
        />
      </Scroll>
    </FlexRow>
  );
}
