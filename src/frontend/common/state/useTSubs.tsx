import { useAppSelector } from "./appState";
import { combineTSubs } from "../../../core/models/TSub";

export default function useTSubs(lessonId: number) {
  const tStrings = useAppSelector(state => state.tStrings);
  const tSubsLite = useAppSelector(state => state.tSubs[lessonId]);
  if (!tSubsLite) return [];

  return combineTSubs(tSubsLite, tStrings);
}
