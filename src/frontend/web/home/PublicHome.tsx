import React, { useState } from "react";
import { usePush } from "../../common/api/RequestContext";
import { pushLogin } from "../../common/state/currentUserSlice";

export default function PublicHome() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginFailed, setLoginFailed] = useState(false);
  const logIn = usePush(pushLogin, appError => {
    if (appError.type == "HTTP" && appError.status == 422) {
      setLoginFailed(true);
      return true;
    }
    return false;
  });

  return (
    <div>
      <p>Check out some lessons</p>
      <h4>Log In</h4>
      <input
        type="text"
        value={username}
        onChange={e => {
          setUsername(e.target.value);
          setLoginFailed(false);
        }}
        placeholder="Username"
      />
      <input
        type="password"
        value={password}
        onChange={e => {
          setPassword(e.target.value);
          setLoginFailed(false);
        }}
        placeholder="Password"
      />
      <p>{loginFailed && "Login failed"}</p>
      <button onClick={() => logIn({ username, password })}>Log In</button>
    </div>
  );
}
