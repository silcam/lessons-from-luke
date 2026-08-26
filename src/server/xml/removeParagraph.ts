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

const PARAGRAPH_NAMES = ["p", "h"];

export function removeParagraph(element: Element, protectedStyles?: ReadonlySet<string>) {
  // Belt-and-braces: never delete a table container itself.
  if (TABLE_CONTAINER_NAMES.has(element.name())) return;

  // Paragraphs whose style carries a fixed page break or a master-page
  // switch are structural: deleting them silently deletes the break/switch
  // with them. Keep them (blank) — checked before the table-container logic
  // so a protected paragraph inside a cell is kept by this guard, not by the
  // cell-validity fallback.
  if (isProtectedParagraph(element, protectedStyles)) return;

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

  if (!parent.text()) removeParagraph(parent, protectedStyles);
  else element.remove();
}

function isProtectedParagraph(element: Element, protectedStyles?: ReadonlySet<string>): boolean {
  if (!protectedStyles || !PARAGRAPH_NAMES.includes(element.name())) return false;
  const styleName = element.attr("style-name")?.value();
  return !!styleName && protectedStyles.has(styleName);
}

function paragraphChildCount(parent: Element) {
  return parent
    .childNodes()
    .filter(
      (node) => node.type() === "element" && PARAGRAPH_NAMES.includes((node as Element).name())
    ).length;
}

function isAnElement(element: Element | Document): element is Element {
  return "text" in element;
}
