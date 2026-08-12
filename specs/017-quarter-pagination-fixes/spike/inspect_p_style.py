#!/usr/bin/env python3
"""
017 spike: inspect an assembled .odt's content.xml with ElementTree (never
regex, per Constraint in research.md/task -- three prior red-team passes were
misled by regexes matching past self-closing style elements into the next
master's body) to answer research R2 -- does insertDocumentFromURL collide
automatic style names across constituents, or rename them on insert?

Usage: inspect_p_style.py <assembled.odt> <style-name e.g. P5>
"""
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    "draw": "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
}


def qn(prefix, tag):
    return f"{{{NS[prefix]}}}{tag}"


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    odt_path, style_name = sys.argv[1], sys.argv[2]

    with zipfile.ZipFile(odt_path) as zf:
        content_xml = zf.read("content.xml")

    root = ET.fromstring(content_xml)

    # 1. Automatic style DEFINITIONS carrying this name, in document order,
    #    across every element type that can define an automatic style
    #    (style:style is the common case; graphic frames also anchor via
    #    draw:style-name pointing at a style:style of family "graphic").
    auto_styles = root.find(qn("office", "automatic-styles"))
    definitions = []
    if auto_styles is not None:
        for el in auto_styles.findall(qn("style", "style")):
            if el.get(qn("style", "name")) == style_name:
                definitions.append(
                    {
                        "family": el.get(qn("style", "family")),
                        "parent": el.get(qn("style", "parent-style-name")),
                    }
                )

    # 2. Every ELEMENT in the body that REFERENCES this style name via any of
    #    the attributes the task calls out (text:style-name, draw:style-name,
    #    etc.) -- walk the whole tree, not just paragraphs, so a reference
    #    surviving on a graphic frame or a text run is not missed.
    ref_attrs = [
        qn("text", "style-name"),
        qn("text", "cond-style-name"),
        qn("draw", "style-name"),
        qn("draw", "text-style-name"),
    ]
    references = []
    for el in root.iter():
        for attr in ref_attrs:
            if el.get(attr) == style_name:
                # grab a little context: first 40 chars of any direct text
                text_preview = (el.text or "").strip()[:40]
                if not text_preview:
                    for child in el.iter():
                        if child.text and child.text.strip():
                            text_preview = child.text.strip()[:40]
                            break
                references.append(
                    {
                        "tag": el.tag.split("}")[-1],
                        "attr": attr.split("}")[-1],
                        "text_preview": text_preview,
                    }
                )

    print(f"file: {odt_path}")
    print(f"style name: {style_name}")
    print(f"definitions found: {len(definitions)}")
    for d in definitions:
        print(f"  - family={d['family']} parent={d['parent']}")
    print(f"references found: {len(references)}")
    for r in references:
        print(f"  - <{r['tag']} {r['attr']}=\"{style_name}\"> text~={r['text_preview']!r}")


if __name__ == "__main__":
    main()
