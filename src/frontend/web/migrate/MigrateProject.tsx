import React, { useEffect, useState } from "react";
import { useLoad, usePush } from "../../common/api/useLoad";
import {
  LegacyTStringWithMatches,
  LegacyTString
} from "../../../core/models/Legacy";
import Axios from "axios";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import { useAppSelector } from "../../common/state/appState";
import Heading from "../../common/base-components/Heading";
import Table from "../../common/base-components/Table";
import Button from "../../common/base-components/Button";
import { useDispatch } from "react-redux";
import loadingSlice from "../../common/api/loadingSlice";
import { loadLanguages } from "../../common/state/languageSlice";
import { TString } from "../../../core/models/TString";
import { pushTStrings } from "../../common/state/tStringSlice";
import { Link } from "react-router-dom";
import TextInput from "../../common/base-components/TextInput";
import styled from "styled-components";
import update from "immutability-helper";
import { FlexRow } from "../../common/base-components/Flex";
import Div from "../../common/base-components/Div";

interface IProps {
  datetime: number; // effective id number for legacy project
  languageId: number; // target language for migration
}

export default function MigrateProject(props: IProps) {
  const push = usePush();
  const dispatch = useDispatch();

  const language = useAppSelector(state => state.languages.adminLanguages).find(
    lng => lng.languageId == props.languageId
  );

  const [exactLegacyStrings, setExactLegacyStrings] = useState<
    LegacyTStringWithMatches[]
  >([]);
  const [legacyStrings, setLegacyStrings] = useState<
    LegacyTStringWithMatches[]
  >([]);

  const [showExact, setShowExact] = useState(true);
  const [legacyStringsIndex, setLegacyStringsIndex] = useState(0);
  const currentLegacyString = legacyStrings[legacyStringsIndex];
  const [inputValues, setInputValues] = useState<string[][]>([]);

  useLoad(loadLanguages(true));
  useEffect(() => {
    dispatch(loadingSlice.actions.addLoading());
    Axios.get(`/api/admin/legacy/project/${props.datetime}`)
      .then(response => {
        setExactLegacyStrings(response.data.exactLegacyStrings);
        setLegacyStrings(response.data.legacyStrings);
        if (response.data.exactLegacyStrings.length == 0) setShowExact(false);
        setInputValues(
          response.data.legacyStrings.map((legStr: LegacyTStringWithMatches) =>
            legStr.matches.map(() => "")
          )
        );
      })
      .finally(() => {
        dispatch(loadingSlice.actions.subtractLoading());
      });
  }, []);

  const saveExact = async () => {
    const newTStrings = exactLegacyStrings.map(legStr =>
      migrateTString(legStr.matches[0], props.languageId, legStr.targetText)
    );
    const result = await push(pushTStrings(newTStrings, language!));
    if (result) setShowExact(false);
  };

  const saveRegular = async () => {
    const newTStrings = currentLegacyString.matches
      .map((tStr, index) =>
        migrateTString(
          tStr,
          props.languageId,
          inputValues[legacyStringsIndex][index]
        )
      )
      .filter(tStr => tStr.text.length > 0);
    if (newTStrings.length > 0) {
      const result = await push(pushTStrings(newTStrings, language!));
      if (result) setLegacyStringsIndex(legacyStringsIndex + 1);
    }
  };

  const combineWithNext = () => {
    const nextLegacyString = legacyStrings[legacyStringsIndex + 1];
    if (!nextLegacyString) return;

    setLegacyStrings(
      update(legacyStrings, {
        [legacyStringsIndex]: {
          src: { $set: `${currentLegacyString.src} ${nextLegacyString.src}` },
          targetText: {
            $set: `${currentLegacyString.targetText} ${nextLegacyString.targetText}`
          },
          matches: { $push: nextLegacyString.matches }
        },
        $splice: [[legacyStringsIndex + 1, 1]]
      })
    );

    setInputValues(
      update(inputValues, {
        [legacyStringsIndex]: { $push: inputValues[legacyStringsIndex + 1] },
        $splice: [[legacyStringsIndex + 1, 1]]
      })
    );
  };

  const setInputValue = (matchIndex: number, value: string) => {
    setInputValues(
      update(inputValues, {
        [legacyStringsIndex]: { [matchIndex]: { $set: value } }
      })
    );
  };

  const fillInput = (matchIndex: number) =>
    setInputValue(matchIndex, currentLegacyString.targetText);

  return (
    <StdHeaderBarPage title={`Migrating ${language?.name}`}>
      <Div pad>
        {exactLegacyStrings.length + legacyStrings.length == 0 ? (
          <p>
            Correlating legacy project source strings with current French
            strings. This could take a minute...
          </p>
        ) : showExact ? (
          <div>
            <Heading level={2} text="Exact Matches" />
            <Button text="Save All" onClick={saveExact} />
            <Table borders>
              {exactLegacyStrings.map((legStr, index) => (
                <tr key={index}>
                  <td>{legStr.src}</td>
                  <td>{legStr.targetText}</td>
                </tr>
              ))}
            </Table>
          </div>
        ) : legacyStringsIndex < legacyStrings.length ? (
          <MigrateProjectDiv>
            <FlexRow>
              <Heading
                text={`String ${legacyStringsIndex + 1} of ${
                  legacyStrings.length
                }`}
                level={2}
              />
              <Button
                text="<<"
                onClick={() => setLegacyStringsIndex(legacyStringsIndex - 1)}
                disabled={legacyStringsIndex == 0}
              />
              <Button
                text=">>"
                onClick={() => setLegacyStringsIndex(legacyStringsIndex + 1)}
                disabled={legacyStringsIndex == legacyStrings.length - 1}
              />
              <Button
                text="Combine with Next"
                onClick={combineWithNext}
                disabled={legacyStringsIndex == legacyStrings.length - 1}
              />
            </FlexRow>
            <Button
              text="Save"
              onClick={saveRegular}
              disabled={inputValues[legacyStringsIndex].every(
                v => v.length == 0
              )}
            />
            <Table borders>
              <tr>
                <th>{currentLegacyString.src}</th>
                <th>{currentLegacyString.targetText}</th>
              </tr>
              {currentLegacyString.matches.map((tStr, matchIndex) => (
                <tr key={matchIndex}>
                  <td>{tStr.text}</td>
                  <td>
                    <Button
                      link
                      text="Fill"
                      onClick={() => fillInput(matchIndex)}
                    />
                    <TextInput
                      value={inputValues[legacyStringsIndex][matchIndex]}
                      setValue={value => setInputValue(matchIndex, value)}
                    />
                  </td>
                </tr>
              ))}
            </Table>
          </MigrateProjectDiv>
        ) : (
          <div>
            <Heading text="Migration Complete" level={2} />
            <Link to="/">
              <Button text="Home" onClick={() => {}} />
            </Link>
          </div>
        )}
      </Div>
    </StdHeaderBarPage>
  );
}

function migrateTString(
  tString: TString,
  languageId: number,
  text: string
): TString {
  return {
    masterId: tString.masterId,
    languageId,
    sourceLanguageId: tString.languageId,
    source: tString.text,
    text,
    history: []
  };
}

const MigrateProjectDiv = styled.div`
  table {
    width: 100%;
  }
`;
