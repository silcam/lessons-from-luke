// DEPRECATED

import React, { useState } from "react";

export interface ACError {
  msg: string;
  render?: () => JSX.Element;
}

interface IErrorContext {
  error: ACError | null;
  setError: (e: ACError | null) => void;
}

const ErrorContext = React.createContext<IErrorContext>({
  error: null,
  setError: _e => {}
});

export default ErrorContext;

export function ErrorContextProvider(props: { children: React.ReactNode }) {
  const [error, setError] = useState<ACError | null>(null);
  return (
    <ErrorContext.Provider value={{ error, setError }}>
      {props.children}
    </ErrorContext.Provider>
  );
}
