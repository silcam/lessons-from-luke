import React from "react";
import { Book } from "../../../core/models/Lesson";
import { PublicLanguage } from "../../../core/models/Language";
import Button from "../../common/base-components/Button";
import useAssembleQuarter, { AssembleMode } from "./useAssembleQuarter";

/**
 * "Assemble quarter" control (US1) — mirrors `GetDocumentButton`'s
 * button/loading-affordance pattern, driven by `useAssembleQuarter`'s
 * queued/running/ready/failed lifecycle.
 *
 * NOT YET IMPLEMENTED — stub for RED task lessons-from-luke-koog.6.2.11; the
 * GREEN task (lessons-from-luke-koog.6.2.12) wires the full queued/running
 * "Assembling…" copy and failed-reason display. For now it always renders
 * the idle button, so the RED tests fail on their assertions rather than a
 * compile/import error.
 */
export default function AssembleQuarterButton(props: {
  language: PublicLanguage;
  book: Book;
  series: number;
  mode: AssembleMode;
  text: string;
}) {
  const { status, start } = useAssembleQuarter(
    props.language,
    props.book,
    props.series,
    props.mode
  );

  return status.tag === "idle" || status.tag === "failed" ? (
    <Button link text={props.text} onClick={start} />
  ) : (
    <span>{props.text}</span>
  );
}
