import React, { useState, useEffect, useContext } from "react";
import RequestContext, {
  usePush,
  useLoad
} from "../../common/api/RequestContext";
import { useDispatch } from "react-redux";
import currentUserSlice, {
  pushLogout
} from "../../common/state/currentUserSlice";
import Foldable from "../../common/base-components/Foldable";
import useTranslation from "../../common/util/useTranslation";
import { useAppSelector } from "../../common/state/appState";
import { loadLanguages } from "../../common/state/languageSlice";
import List from "../../common/base-components/List";
import LanguagesBox from "../languages/LanguagesBox";
import LessonsBox from "../lessons/LessonsBox";

export default function AdminHome() {
  // const [sources, setSources] = useState<SourceManifest>([]);
  const push = usePush();
  const logOut = () => push(pushLogout());
  const t = useTranslation();

  // useEffect(() => {
  //   get("/api/sources", {}).then(sources => sources && setSources(sources));
  // }, []);

  return (
    <div>
      <h1>Hi Chris!</h1>
      <button onClick={logOut}>Log out</button>
      <LanguagesBox />
      <LessonsBox />
    </div>
  );
}
