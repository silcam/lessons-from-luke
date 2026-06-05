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
    // latch hasBeenDirty once dirty; cascading render is the point of the latch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasBeenDirty(hasBeenDirty || dirty);
    if (hasBeenDirty) onStateChange(dirty);
    // onStateChange callback intentionally not tracked — fire only on dirty/hasBeenDirty change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, hasBeenDirty]);

  return {
    dirty,
    setDirty,
    setClean,
  };
}
