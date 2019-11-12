import React, { useContext, useEffect } from "react";
import ErrorContext from "./ErrorContext";
import { useLocation } from "react-router-dom";

export default function ErrorMessage() {
  const { error, setError } = useContext(ErrorContext);

  const location = useLocation();
  useEffect(() => {
    setError(null);
  }, [location.pathname]);

  return error ? (
    <div className="compErrorMessage">
      {error.render ? (
        error.render()
      ) : (
        <React.Fragment>
          <div>{error.msg}</div>
          <button className="btn-lnk" onClick={() => setError(null)}>
            X
          </button>
        </React.Fragment>
      )}
    </div>
  ) : null;
}
