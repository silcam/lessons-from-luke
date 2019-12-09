import React, { useState, useEffect, useContext } from "react";
import RequestContext from "../../api/RequestContext";
import { useDispatch } from "react-redux";
import currentUserSlice, {
  pushLogout
} from "../../common/state/currentUserSlice";

export default function AdminHome() {
  // const [sources, setSources] = useState<SourceManifest>([]);
  const { get, post } = useContext(RequestContext);
  const dispatch = useDispatch();

  const logOut = () => dispatch(pushLogout(post));

  // useEffect(() => {
  //   get("/api/sources", {}).then(sources => sources && setSources(sources));
  // }, []);

  return (
    <div>
      <h1>Hi Chris!</h1>
      <button onClick={logOut}>Log out</button>
      <h2>Sources</h2>
      <ul>
        {/* {sources.map(source => (
          <li key={source.language}>{source.language}</li>
        ))} */}
      </ul>
    </div>
  );
}
