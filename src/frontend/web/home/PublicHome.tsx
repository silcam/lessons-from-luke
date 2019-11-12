import React, { useState } from "react";
import { LogInFunc } from "../users/useCurrentUser";

interface IProps {
  logIn: LogInFunc;
}

export default function PublicHome(props: IProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div>
      <p>Check out some lessons</p>
      <h4>Log In</h4>
      <input
        type="text"
        value={username}
        onChange={e => setUsername(e.target.value)}
        placeholder="Username"
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button
        onClick={() =>
          props.logIn({ username, password }, e => console.error(e))
        }
      >
        Log In
      </button>
    </div>
  );
}
