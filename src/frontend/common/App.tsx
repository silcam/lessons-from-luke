import React, { useState, useEffect } from "react";
import { Source } from "../../core/Source";
import Axios from "axios";

interface IProps {
  heading: string;
}

export default function App(props: IProps) {
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    Axios.get("/api/sources")
      .then(response => setSources(response.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div>
      <h2>{props.heading}</h2>
      <h3>Sources</h3>
      <ul>
        {sources.map(src => (
          <li key={src.language}>{src.language}</li>
        ))}
      </ul>
    </div>
  );
}
