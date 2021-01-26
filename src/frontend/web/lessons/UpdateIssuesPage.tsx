import React from "react";
import { useLoad } from "../../common/api/useLoad";
import useTSubs from "../../common/state/useTSubs";
import useTranslation from "../../common/util/useTranslation";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import { TSub, SubPiece } from "../../../core/models/TSub";
import Table from "../../common/base-components/Table";
import Div from "../../common/base-components/Div";
import TStringInput from "../../common/translate/TStringInput";
import { newTStringFromSrc } from "../../../core/models/TString";
import { useAppSelector } from "../../common/state/appState";
import { loadLanguages } from "../../common/state/languageSlice";
import Alert from "../../common/base-components/Alert";
import { loadTSubs } from "../../common/state/tSubSlice";

export default function UpdateIssuesPage() {
  const t = useTranslation();
  useLoad(loadLanguages(true));
  const loading = useLoad(loadTSubs());

  const tSubs = useTSubs();
  const complete = useAppSelector(state => state.tSubs.complete);

  return (
    <StdHeaderBarPage title={t("Resolve_lesson_update_issues")}>
      {!complete && <Alert>{t("Computing_diff")}</Alert>}
      {tSubs.length > 0 ? (
        tSubs.map((tSub, index) => (
          <Div pad key={index}>
            <TSubTable tSub={tSub} />
          </Div>
        ))
      ) : (
        <h2>{loading || !complete ? "Loading..." : "No issues :)"}</h2>
      )}
    </StdHeaderBarPage>
  );
}

function TSubTable(props: { tSub: TSub }) {
  const { tSub } = props;
  const language = useAppSelector(
    state =>
      state.languages.adminLanguages.find(l => l.languageId == tSub.languageId)!
  );
  if (!language) return null;

  return (
    <Table borders>
      <tr>
        <td>
          <MergeText tStrs={tSub.engFrom} />
        </td>
        <td>
          <MergeText tStrs={tSub.from} />
        </td>
      </tr>
      {tSub.engTo.map((tStr, index) => (
        <tr key={index}>
          <td>{tStr ? tStr.text : "[--]"}</td>
          <td>
            {tStr && (
              <TStringInput
                tString={
                  tSub.to[index] || newTStringFromSrc("", tSub.languageId, tStr)
                }
                language={language}
                markDirty={() => {}}
                markClean={() => {}}
              />
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
}

function MergeText(props: { tStrs: SubPiece[] }) {
  return (
    <React.Fragment>
      {props.tStrs.map((tStr, index) => (
        <span key={index}>
          {tStr ? tStr.text : "[--]"}
          {index < props.tStrs.length && <br />}
        </span>
      ))}
    </React.Fragment>
  );
}
