import { useState, useEffect } from "react";

// Not used or tested

export default function useDebounce<T>(
  initalValue: T,
  updater: (t: T) => void,
  debounce = 1000
): [T, (t: T) => void] {
  const [value, setValue] = useState(initalValue);
  const [upstreamValue, setUpstreamValue] = useState(initalValue);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (value !== upstreamValue) {
        updater(value);
        setUpstreamValue(value);
      }
    }, debounce);

    return () => clearTimeout(timeout);
  }, [value, upstreamValue]);

  return [value, setValue];
}
