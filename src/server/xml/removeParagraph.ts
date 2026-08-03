import { Document, Element } from "libxmljs2";

// ODF table containers must never be deleted by empty-paragraph cleanup:
// removing a cell (or row) breaks table geometry — rows end up with fewer
// cells than declared columns, which soffice later "repairs" during quarter
// assembly, scrambling position-based cell styles.
const TABLE_CONTAINER_NAMES = new Set([
  "table",
  "table-row",
  "table-header-rows",
  "table-cell",
  "covered-table-cell",
]);

export function removeParagraph(element: Element) {
  // Belt-and-braces: never delete a table container itself.
  if (TABLE_CONTAINER_NAMES.has(element.name())) return;

  const parent = element.parent();
  if (!isAnElement(parent)) {
    element.remove();
    return;
  }

  if (TABLE_CONTAINER_NAMES.has(parent.name())) {
    // Never recurse upward from a table container. Remove the paragraph only
    // if the container retains at least one other paragraph; otherwise leave
    // the (already-blanked) empty paragraph in place so the cell stays valid.
    if (paragraphChildCount(parent) > 1) element.remove();
    return;
  }

  if (!parent.text()) removeParagraph(parent);
  else element.remove();
}

function paragraphChildCount(parent: Element) {
  return parent
    .childNodes()
    .filter((node) => node.type() === "element" && ["p", "h"].includes((node as Element).name()))
    .length;
}

function isAnElement(element: Element | Document): element is Element {
  return "text" in element;
}
