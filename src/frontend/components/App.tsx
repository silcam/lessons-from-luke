import React, { useState, useEffect } from "react";
import { TString, toTString } from "../../core/TString";
import Axios from "axios";

interface IProps {
  heading: string;
}

export default function App(props: IProps) {
  const [str, setString] = useState("Hello you peoples!");
  const tStr: TString = toTString(str);

  useEffect(() => {
    Axios.get("/api/str")
      .then(response => setString(response.data.targetText))
      .catch(err => console.error(err));
  }, []);

  return (
    <div>
      <h2>{props.heading}</h2>
      <pre>{JSON.stringify(tStr)}</pre>
      <input
        type="text"
        value={str}
        onChange={e => setString(e.target.value)}
      />
    </div>
  );
}
