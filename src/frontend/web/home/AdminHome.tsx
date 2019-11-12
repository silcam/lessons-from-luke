import React, { useState, useEffect, useContext } from "react";
import { SourceManifest } from "../../../core/Source";
import { APIContext } from "../../api/useAPI";

export default function AdminHome() {
  const [sources, setSources] = useState<SourceManifest>([]);
  const { get } = useContext(APIContext);

  useEffect(() => {
    get("/api/sources", {}).then(sources => sources && setSources(sources));
  }, []);

  return (
    <div>
      <h1>Hi Chris!</h1>
      <h2>Sources</h2>
      <ul>
        {sources.map(source => (
          <li key={source.language}>{source.language}</li>
        ))}
      </ul>
    </div>
  );
}
