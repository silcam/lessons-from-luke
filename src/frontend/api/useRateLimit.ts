import { useState } from "react";

// Not used and not tested

export default function useRateLimit(
  f: () => void,
  rateLimit = 1000
): () => void {
  const [suppress, setSuppress] = useState(false);
  const execF = () => {
    if (!suppress) {
      setSuppress(true);
      setTimeout(() => setSuppress(false), rateLimit);
      f();
    }
  };
  return execF;
}
