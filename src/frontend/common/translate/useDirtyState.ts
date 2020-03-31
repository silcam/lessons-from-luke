import { useState, useEffect } from "react";
import { unset } from "../../../core/util/objectUtils";

export default function useDirtyState(onStateChange: (dirty: boolean) => void) {
  const [hasBeenDirty, setHasBeenDirty] = useState(false);
  const [dirtyLessonStrings, setDirtyLessonStrings] = useState<{
    [id: string]: boolean;
  }>({});
  const setDirty = (id: number) => {
    setDirtyLessonStrings({ ...dirtyLessonStrings, [id.toString()]: true });
  };
  const setClean = (id: number) => {
    setDirtyLessonStrings(unset(dirtyLessonStrings, id.toString()));
  };
  const dirty = Object.keys(dirtyLessonStrings).length > 0;

  useEffect(() => {
    setHasBeenDirty(hasBeenDirty || dirty);
    if (hasBeenDirty) onStateChange(dirty);
  }, [dirty, hasBeenDirty]);

  return {
    dirty,
    setDirty,
    setClean
  };
}
