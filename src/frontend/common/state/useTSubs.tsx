import { useAppSelector } from "./appState";
import { combineTSubs } from "../../../core/models/TSub";

export default function useTSubs() {
  const tStrings = useAppSelector(state => state.tStrings);
  const tSubsLite = useAppSelector(state => state.tSubs);

  return combineTSubs(tSubsLite, tStrings);
}
