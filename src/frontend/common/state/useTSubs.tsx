import { useAppSelector } from "./appState";
import { combineTSubs } from "../../../core/models/TSub";
import { useJustLoad } from "../api/useLoad";
import { loadTSubs } from "./tSubSlice";
import { useEffect } from "react";

export default function useTSubs() {
  const tStrings = useAppSelector(state => state.tStrings);
  const tSubsLite = useAppSelector(state => state.tSubs.tSubsLite);

  return combineTSubs(tSubsLite, tStrings);
}

export function useLoadTSubs() {
  const [load, loading] = useJustLoad();
  const complete = useAppSelector(state => state.tSubs.complete);

  // Initial Load
  useEffect(() => {
    load(loadTSubs());
  }, []);

  // Recurring Load
  useEffect(() => {
    if (!complete) {
      const timer = setInterval(() => {
        load(loadTSubs({ noRecompute: true }));
      }, 15000);
      return () => clearInterval(timer);
    }
  }, [complete]);

  return loading;
}
