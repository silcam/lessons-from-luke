import { useEffect, useRef } from "react";
import { LessonTString } from "./useLessonTStrings";

export default function usePreviewScroll(
  selectedLTStr: LessonTString | undefined
) {
  const scrollDivRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scrollDiv = scrollDivRef.current;
    if (!scrollDiv || !selectedLTStr) return;

    const targetSpan = document.getElementById(
      `ls${selectedLTStr.lStr.lessonStringId}`
    );
    if (!targetSpan) return;

    // Highlight it
    document
      .querySelector(".lessonString.selected")
      ?.classList.remove("selected");
    targetSpan.classList.add("selected");

    // Scroll to it
    const targetTop =
      targetSpan.getBoundingClientRect().top -
      scrollDiv.getBoundingClientRect().top +
      scrollDiv.scrollTop -
      30;
    const diff = targetTop - scrollDiv.scrollTop;
    if (diff < -30 || diff > 100)
      scrollDiv.scroll({ top: targetTop, behavior: "smooth" });
  }, [selectedLTStr]);

  return scrollDivRef;
}
