import React, { useEffect, useState } from "react";
import { LegacyProject } from "../../../core/models/Legacy";
import Axios from "axios";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import Table from "../../common/base-components/Table";
import Button from "../../common/base-components/Button";
import Heading from "../../common/base-components/Heading";
import Label from "../../common/base-components/Label";
import {
  Language,
  PublicLanguage,
  FRENCH_ID
} from "../../../core/models/Language";
import { useLoad, usePush } from "../../common/api/useLoad";
import { loadLanguages, pushLanguage } from "../../common/state/languageSlice";
import { useAppSelector } from "../../common/state/appState";
import TextInput from "../../common/base-components/TextInput";
import SelectInput from "../../common/base-components/SelectInput";
import { useHistory } from "react-router-dom";
import { useDispatch } from "react-redux";
import loadingSlice from "../../common/api/loadingSlice";

export default function MigrateProjectsIndex() {
  const push = usePush();
  const dispatch = useDispatch();
  const history = useHistory();
  const languages = useAppSelector(state => state.languages.adminLanguages);

  const [projects, setProjects] = useState<LegacyProject[]>([]);
  const [selectedProject, _setSelectedProject] = useState<LegacyProject | null>(
    null
  );
  const [makeNewLang, setMakeNewLang] = useState(true);
  const [targetLanguage, setTargetLanguage] = useState<PublicLanguage | null>(
    null
  );
  const [newLangName, setNewLangName] = useState("");
  const setSelectedProject = (project: LegacyProject) => {
    _setSelectedProject(project);
    setTargetLanguage(null);
    setNewLangName(project.targetLang);
  };

  const readyToStartMigration =
    !!selectedProject && makeNewLang ? !!newLangName : !!targetLanguage;
  const startMigration = async () => {
    if (!readyToStartMigration) return;
    let languageId;
    if (!makeNewLang) {
      languageId = targetLanguage?.languageId;
    } else {
      const newLanguage = await push(
        pushLanguage({ name: newLangName, defaultSrcLang: FRENCH_ID })
      );
      if (!newLanguage) return;
      languageId = newLanguage?.languageId;
    }
    if (!languageId) return;
    history.push(`/migrate/${selectedProject?.datetime}/to/${languageId}`);
  };

  useLoad(loadLanguages(true));
  useEffect(() => {
    dispatch(loadingSlice.actions.addLoading());
    Axios.get("/api/admin/legacy/projects")
      .then(response => setProjects(response.data))
      .finally(() => {
        dispatch(loadingSlice.actions.subtractLoading());
      });
  }, []);
  useEffect(() => {
    if (!targetLanguage && languages.length > 0)
      setTargetLanguage(languages[0]);
  });

  return (
    <StdHeaderBarPage title={"Migrate"}>
      <Table>
        <tr>
          <th>Projects</th>
        </tr>
        {projects.map(project => (
          <tr>
            <td>
              <Label text={project.targetLang} childrenFirst>
                <input
                  type="radio"
                  checked={project.datetime === selectedProject?.datetime}
                  onChange={() => setSelectedProject(project)}
                />
              </Label>
            </td>
          </tr>
        ))}
      </Table>
      {selectedProject && (
        <div>
          <Heading level={3} text={`Migrate ${selectedProject.targetLang}`} />
          <Table>
            <tr>
              <td>
                <Label text={"Into new language:"} childrenFirst>
                  <input
                    type="radio"
                    checked={makeNewLang}
                    onChange={() => setMakeNewLang(true)}
                  />
                </Label>
              </td>
              <td>
                <TextInput value={newLangName} setValue={setNewLangName} />
              </td>
            </tr>
            <tr>
              <td>
                <Label text={"Into existing language:"} childrenFirst>
                  <input
                    type="radio"
                    checked={!makeNewLang}
                    onChange={() => setMakeNewLang(false)}
                  />
                </Label>
              </td>
              <td>
                {
                  <SelectInput
                    value={`${targetLanguage?.languageId}` || ""}
                    options={languages.map(lang => [
                      `${lang.languageId}`,
                      lang.name
                    ])}
                    setValue={id =>
                      setTargetLanguage(
                        languages.find(
                          lang => lang.languageId == parseInt(id)
                        ) || null
                      )
                    }
                  />
                }
              </td>
            </tr>
          </Table>
          <Button text="Start Migration" onClick={startMigration} />
        </div>
      )}
    </StdHeaderBarPage>
  );
}
