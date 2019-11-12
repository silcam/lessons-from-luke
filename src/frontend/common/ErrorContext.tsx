import React from "react";

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
