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
import { usePush } from "../api/RequestContext";

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
  const ltStringsForTranslation = props.language.motherTongue
    ? props.lessonTStrings.filter(ltStr => ltStr.lStr.motherTongue)
    : props.lessonTStrings;
  const selectedLTStr: LessonTString | undefined =
    ltStringsForTranslation[index];
  const scrollDivRef = usePreviewScroll(selectedLTStr);

  const save = async (text: string) => {
    const savedStr = await push(
      pushTStrings(
        [
          newTString(
            text,
            selectedLTStr.lStr,
            props.language,
            selectedLTStr.tStrs[0]
          )
        ],
        props.language
      ),
      err => {
        if (err.type == "No Connection") onConnectionRestored(() => save(text));
        return false;
      }
    );
    return !!savedStr;
  };

  return (
    <FlexRow>
      <FlexCol pad>
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
                onClick={() =>
                  setIndex(
                    ltStringsForTranslation.findIndex(
                      (ltStr, i) => i > index && !ltStr.tStrs[1]
                    ) || ltStringsForTranslation.length - 1
                  )
                }
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
            <Button text={t("Save")} onClick={() => {}} />
          </Div>
        )}
      </FlexCol>
      <Scroll ref={scrollDivRef} flexZero>
        <DocPreview
          lessonId={props.lesson.lessonId}
          srcLangId={props.srcLangId}
          targetLangId={props.language.languageId}
          docHtml={props.docHtml}
          lessonTStrings={props.lessonTStrings}
        />
      </Scroll>
    </FlexRow>
  );
}
