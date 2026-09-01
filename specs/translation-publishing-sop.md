# Lessons from Luke Translation Publishing SOP

**Document type:** Standard Operating Procedure (SOP)  
**Project:** Lessons from Luke / Lessons from Acts  
**Primary workflow owner:** Chris Jackson, SIL International  
**Prepared from:** David / Chris interview, April 24, plus original process notes  
**Current status:** Expanded working draft  
**Primary tools:** SILCAM Lessons from Luke web app, LibreOffice, Google Drive, Paratext/USFM exports, PDF imposition/shrinking tools

---

## 1. Purpose

This SOP documents the complete workflow for preparing a new Lessons from Luke or Lessons from Acts translation document for publication. It covers the operational path from SILCAM translation output through LibreOffice assembly, document cleanup, PDF creation, cover preparation, and final Google Drive organization.

The goal is to capture not only the button-clicking sequence, but also the tacit knowledge Chris has accumulated about why the process works, where it breaks, what should not be touched, and which manual interventions are still required.

The workflow exists because the Lessons from Luke platform produces individual translated LibreOffice `.ODT` lesson files, but the final deliverable for users is usually a complete quarter book, prepared as print-ready PDF files in both ordinary A4 form and imposed A3 booklet form. LibreOffice master documents (`.ODM`) are used to assemble the table of contents plus thirteen lessons into a single editable `.ODT`, which is then manually corrected and exported to PDF.

---

## 2. Scope

This SOP covers:

1. Creating or preparing a language project in the Lessons from Luke platform.
2. Importing Scripture from USFM / Paratext files when available.
3. Understanding bilingual versus monolingual output.
4. Downloading translated lesson files from the platform.
5. Organizing language, quarter, cover, editable, and PDF files in Google Drive.
6. Assembling one quarter of lessons using a LibreOffice `.ODM` master document.
7. Exporting the assembled quarter to an editable `.ODT`.
8. Breaking LibreOffice links and removing section protection.
9. Correcting footers, document properties, labels, front matter, images, and pagination.
10. Exporting final A4 PDFs.
11. Creating imposed A3 booklet PDFs.
12. Preparing A4 and A3 covers.
13. Naming and filing all final outputs.
14. Capturing known problems, workarounds, and automation opportunities.

This SOP does **not** fully cover:

- How to author original source lesson documents from scratch.
- How to perform Bible translation or Scripture checking.
- How to use Paratext generally.
- How to modify the Lessons from Luke codebase.
- How to automate the workflow programmatically, except in the notes and automation appendix.

---

## 3. Key Concepts

### 3.1 Lessons from Luke and Lessons from Acts

The curriculum is commonly referred to as **Lessons from Luke**, but the system also includes **Lessons from Acts**. Together, the curriculum contains 104 lessons. Lessons from Acts was created after Lessons from Luke in response to demand from early users of the curriculum.

In practice, the publishing workflow is the same for Luke and Acts:

- Each book is divided into quarters.
- Each quarter normally contains a table of contents plus thirteen lessons.
- Each lesson is downloaded as an individual `.ODT` file from the platform.
- A quarter is assembled manually in LibreOffice using a master document.

### 3.2 Source language, reference language, and target language

A Lessons from Luke project is created from a source/reference language and translated into a target language.

Important examples:

- The original English project exists in the system, but Chris no longer edits it directly because changes to source strings can damage downstream translation links and history.
- A later English reference project based on the World English Bible became the reference project for English-based work because of publication-permission issues.
- French is complete and often serves as the major-language reference for Cameroonian languages.

The target language is the language into which the curriculum is being translated or published.

### 3.3 Bilingual / “mother tongue” projects

The platform uses the term **mother tongue**, but in publication terms this usually means a **bilingual** document.

In a bilingual document:

- Only selected teaching content is translated into the local language.
- The structural mechanics of the lesson remain in a major language such as French or English.
- The highlighted yellow portions are the parts intended for translation into the local language.
- The major-language reference text remains in the document to support teachers who can read the major language and are learning or improving reading fluency in the local language.

This approach was designed to reduce the up-front translation burden and make the curriculum easier for communities to adopt.

### 3.4 Monolingual / single-language projects

The platform uses the link label **single language** for monolingual output.

In a monolingual document:

- The whole curriculum is expected to be translated.
- Where the document previously contained local-language text plus major-language replication underneath, the platform automatically duplicates the translated local-language text into both places.
- This avoids the old manual process of deleting replicated major-language content from the final document.

A larger or more established language may warrant a full monolingual translation. In the interview, Fufulde is treated this way because it is large enough and functions as a reference language.

### 3.5 “Standard” output

The platform’s **standard** download link corresponds to the bilingual/mother-tongue-style document. The label is opaque and should ideally be renamed in the software to **bilingual**.

### 3.6 Table of Contents lesson

The table of contents is treated as a special document in the system. It must be downloaded and assembled with the quarter. In LibreOffice master-document assembly, the TOC must be inserted first.

### 3.7 Cover files

Cover files currently live outside the main platform workflow. They are LibreOffice `.ODT` files that must be copied and manually edited.

There are two cover formats:

- **A4 cover:** cut-sheet cover, suitable for normal printing or binding workflows.
- **A3 cover:** full spread cover for booklet-style printing.

The cover is printed separately from the interior because the cover is normally color and the interior pages are black and white.

### 3.8 A4 and A3 outputs

The workflow normally produces four final PDF deliverables per quarter:

1. A4 interior PDF, ordinary page order.
2. A3 imposed booklet PDF for the interior.
3. A4 cover PDF.
4. A3 cover PDF.

The A4 interior can be printed front/back and comb-bound or otherwise bound. The A3 imposed version is intended for booklet printing and staple binding where printing services can support it.

---

## 4. Required Tools and Access

### 4.1 Tools

Install or have access to:

- Lessons from Luke / SILCAM web application.
- Google Drive.
- LibreOffice.
- Paratext or USFM Scripture files supplied by someone with Paratext access.
- PDF imposition software for A3 booklet creation.
  - Chris uses **Cheap Imposter**.
- PDF compression software.
  - Chris uses **PDF Shrink**.

### 4.2 Platform access

The Lessons from Luke platform currently has a single administrator login. After login, the administrator sees a list of language projects and progress percentages.

### 4.3 Local workstation assumptions

The operator must have LibreOffice installed. The workflow depends on LibreOffice-specific behavior, especially the use of `.ODM` master documents, section protection, external file links, paragraph styles, and PDF export.

---

## 5. High-Level Workflow

At a high level, the workflow is:

1. Prepare or verify the language project in the web application.
2. Upload USFM Scripture text if available.
3. Fix any Scripture import errors manually.
4. Confirm translation progress and fill required metadata.
5. Decide output type: bilingual or monolingual.
6. Download one quarter of individual `.ODT` files:
   - Table of contents.
   - Lessons 1–13 for that quarter.
7. Create a language folder and quarter folder in Google Drive.
8. Copy a model `.ODM` file into the quarter folder.
9. Rename the model `.ODM` for the language and quarter.
10. Open the `.ODM` in LibreOffice.
11. Insert the TOC first.
12. Insert lessons 13 down to 1 underneath the TOC.
13. Export the `.ODM` as an `.ODT` file.
14. Open the exported `.ODT` and update links when first prompted.
15. Unlock all sections.
16. Remove external document links / convert linked content into ordinary editable content.
17. Update document properties, footers, labels, and front matter.
18. Perform the visual QA pass.
19. Save the final editable `.ODT`.
20. Export or print to A4 PDF.
21. Create imposed A3 interior PDF.
22. Prepare A4 and A3 cover PDFs.
23. Shrink PDFs if needed.
24. Rename according to naming convention.
25. File editable and PDF deliverables in the correct Google Drive folders.

---

## 6. Platform Preparation

### 6.1 Log in to the administrator interface

1. Open the Lessons from Luke platform.
2. Log in with the administrator credentials.
3. Confirm that you can see the list of language projects.

The project list shows progress percentages. A project may appear partially complete simply because Scripture has been imported. Chris noted that once Scripture is imported, a project may show roughly 12–14% progress even before much curriculum translation has been completed.

### 6.2 Do not edit the original English source project

Do **not** edit the original English project unless there is a deliberate, tested migration plan.

Chris’s warning: editing an original source string can break the link between that source string and downstream translations. Worse, the translation history for that string can be lost. This is not merely a cosmetic risk; it can destroy work already done in other languages.

Operational rule:

> Treat original source-language projects as locked, even if the software does not enforce locking.

If a source-language correction is required, escalate before editing. Confirm whether the current reference project is the original English project, the World English Bible updated project, French, or another reference language.

### 6.3 Be cautious when creating new projects

The system can create projects, but it does not currently provide an easy way to delete abandoned projects or lock completed projects.

Before creating a new project, confirm:

- Target language name.
- Source/reference language.
- Whether the project is intended to be bilingual or monolingual.
- Whether Luke, Acts, or both are in scope.
- Whether Scripture text is available and approved.

Avoid creating test projects in production unless necessary.

---

## 7. Creating or Reviewing a Language Project

### 7.1 Create a language project

From the administrator project list:

1. Click **Add Language** or equivalent.
2. Select the source/reference language.
3. Enter the target language name.
4. Create the project.

After creation, the project will have a unique project code embedded in its translation URL.

### 7.2 Project code for translators

The translation page URL contains a unique project code near the end. Chris described this as an eight-character code in the URL.

This code is used for the offline desktop app:

1. Send the translator the online translation URL if they will work online.
2. If they will use the offline app, send:
   - the app download link,
   - the project code,
   - basic sync instructions.
3. On first launch, the offline app asks for the project code.
4. The app downloads the project data for offline work.

### 7.3 Offline app behavior

The offline app looks substantially like the web translation interface. It supports the same basic translation workflow, but stores data locally and syncs when connectivity is available.

There are Mac and Windows versions. There is no Linux version noted in the interview.

---

## 8. Uploading Scripture from USFM

### 8.1 Preconditions

Before using Lessons from Luke for a language, the Luke and/or Acts Scripture text should already be translated and approved through the normal consultant/publication process.

Chris avoids editing Scripture text in the Lessons from Luke platform. Scripture should come from the approved Paratext/USFM source.

### 8.2 Upload USFM

From the language project administrator screen:

1. Click **Upload USFM**.
2. Select the USFM/SFM file supplied from Paratext.
3. Upload it to the project.
4. Wait for the parser to process it.

The import process:

- Parses chapter and verse references.
- Matches the USFM Scripture to the curriculum Scripture slots.
- Pastes the Scripture into the relevant fields.
- Produces a report at the end.

If successful, it generally takes about a minute and reports completion.

### 8.3 Review the import report

After import, check the report carefully.

If there are no errors, proceed.

If there is an error, the software may not flag the individual lesson in an obvious persistent way. Chris takes note of the error immediately and then repairs it manually.

### 8.4 Common USFM import error: missing or merged verse numbers

Some translation projects do not preserve the exact same verse numbering as the English or French reference. A verse may be merged with another verse or omitted as a separate number because the language does not make sense with that division.

Example from the interview:

- Reference text: Acts 19:35–41.
- Target-language USFM: Acts 19:35–40.
- The content is scripturally present, but the final verse number does not exist separately.

When this happens, the software may paste nothing into that Scripture slot and instead report that the import failed for that passage.

### 8.5 Manual repair for USFM import errors

When a USFM import error occurs:

1. Note the lesson and reference from the import report.
2. Open the target-language USFM/SFM file as a text file.
3. Find the corresponding chapter and verse range.
4. Copy the relevant Scripture text from the USFM file.
5. Open the relevant lesson/string in the Lessons from Luke translation interface.
6. Paste the Scripture text manually into the correct target-language field.
7. Save or move to the next field to trigger autosave.
8. Confirm the previously blank Scripture field now contains the target text.

### 8.6 Do not edit Scripture text stylistically

Do **not** change Scripture text merely to match punctuation, hyphenation, or formatting preferences.

Chris’s rule:

> Scripture text imported from Paratext is left alone.

This includes ordinary hyphens in Scripture references or Scripture text. Chris only distinguishes special curriculum references manually; he does not normalize Paratext-imported Scripture punctuation.

---

## 9. Translation Interface Workflow

### 9.1 Opening the translation interface

From a language project administrator screen:

1. Click **Translate**.
2. Select or confirm the reference language if necessary.
3. Navigate to the desired book, quarter, and lesson.

### 9.2 Understanding highlighted text

Yellow highlighting is a legacy feature from the original LibreOffice-based workflow. It indicates content intended for mother-tongue/local-language translation.

In a bilingual project:

- Yellow/highlighted teaching content is translated.
- Non-highlighted mechanics may remain in the major reference language.

In a monolingual project:

- The entire lesson is expected to be translated.
- Translated text may be replicated into parallel places automatically.

### 9.3 Navigation controls

The translation interface includes blue arrow controls.

Typical behavior:

- Double-left arrow: move back one step.
- Double-right arrow: move forward one step.
- Triple-right arrow/caret: jump to the next untranslated item in the lesson.

The triple-caret jump is useful for QA because it can quickly reveal missing translations.

### 9.4 Clicking directly in the preview

The operator can click directly on translatable text in the right-side lesson preview to edit that string.

In a bilingual project, non-translatable major-language structural text cannot be clicked/edited in the same way.

### 9.5 Save behavior

The interface has a save button, but moving to another slot or clicking the next navigation button also saves automatically. Chris relies on this behavior, but for critical metadata fields an operator may still prefer to click **Save** explicitly.

### 9.6 Translation history

The system retains edit history for translated strings. This allows the operator to see prior versions of a field and understand changes.

Warning: this history can be lost if source strings are edited in a way that breaks their links.

---

## 10. Project Metadata and Repeating Strings

### 10.1 Metadata fields in the table of contents

The table of contents contains metadata fields that should be filled for the language/project. These may include:

- Language name.
- Region where the language is spoken.
- ISO code.
- Title.
- Translator names.
- Scripture source.
- Publisher.
- Publisher address.
- City.
- Region.
- Country.
- Year of publication.

Once these are entered in the TOC, many of them propagate to all TOC files throughout the curriculum.

### 10.2 Reusable string behavior

The system reuses matching strings. If a string is isolated and translated once, it can populate elsewhere in the curriculum.

Examples:

- The word **Luke** can be translated once and then replicated wherever the same isolated string appears.
- The word **Acts** can be translated once and then replicated similarly.
- Brackets, if isolated correctly as strings, can be populated consistently across the curriculum.

### 10.3 Double-space separation

Chris discovered that using a double space in source documents can cause the software to split text into separate translation units.

Example:

```text
Luke  1:5–25
```

With a double space between `Luke` and the reference, the platform can treat `Luke` as one reusable string and the reference as another.

This allows the book name to be translated independently while preserving or separately handling the numeric reference.

### 10.4 Scripture references and en-dashes

Chris intentionally uses en-dashes in manually created curriculum references, while Paratext-imported Scripture may use ordinary hyphens.

Reason:

- Manually created curriculum references with en-dashes may be easier to distinguish programmatically in future automation.
- Paratext-imported Scripture is not modified just to standardize punctuation.

### 10.5 Picture numbers

Picture-reference numbers are automatically generated when a new project is created. This was an automation Rick added to reduce manual work.

These are references such as lesson/picture numbers for Bible story picture books.

If picture numbers are missing, check whether the project was created before the automation existed or whether some initialization failed.

### 10.6 Verse-reference numbers in the TOC

Verse-reference numbers in the table of contents are **not** automatically created in the current workflow.

Chris manually fills these by:

1. Going to the table of contents.
2. Clicking into the verse-reference field.
3. Copying the original/reference value.
4. Pasting it into the target field.
5. Saving.
6. Moving to the next field.

Once the TOC reference is filled in, it replicates wherever that reference occurs in the curriculum.

### 10.7 Versification differences in headings

If the target-language Scripture has a different verse span because a verse is merged or not separately numbered, Chris usually leaves the heading/reference as it was in the original/reference language.

For example, if the original says Acts 19:35–41 but the target-language USFM only has 19:35–40, he may still leave the lesson heading as 19:35–41. The content is present; the numeric representation differs. The practical risk is low, and the heading can be manually corrected later if someone raises it.

---

## 11. Downloading Lesson Files from the Platform

### 11.1 Choose output type

On the language project screen, each lesson has download links. Select the correct link based on the requested deliverable:

- **Standard** = bilingual / mother-tongue format.
- **Single language** = monolingual format.

Confirm with the requester whether they need bilingual or monolingual output.

### 11.2 Download one quarter at a time

For each quarter, download:

- Table of contents.
- Lessons 1 through 13.

Each file downloads as an individual LibreOffice `.ODT` file.

Do not attempt to assemble the quarter directly in the browser. The current workflow requires LibreOffice.

### 11.3 Confirm all files are present

Before assembly, verify the quarter folder contains:

- 1 TOC `.ODT` file.
- 13 lesson `.ODT` files.
- 1 copied/renamed `.ODM` model file.

Optional but recommended:

- Cover `.ODT` files for the quarter.
- A notes file recording output type, source language, target language, and date.

---

## 12. Google Drive Folder Setup

### 12.1 Main editable-files folder

Place editable files under the appropriate **Luke mono editable files** or equivalent project folder.

The SILCAM export produces LibreOffice `.ODT` files. These belong in the editable files area, not the final PDF area.

### 12.2 Language folder

Inside the editable files folder:

1. Create a folder named for the target language.
2. Use a consistent spelling of the language name.
3. Avoid renaming the language folder after publication unless absolutely necessary.

### 12.3 Quarter folders

Inside the language folder, create subfolders for each quarter.

Typical pattern:

```text
Target Language/
  Q1/
  Q2/
  Q3/
  Q4/
  Covers/
```

For Acts, use the project’s established naming pattern. If Luke and Acts are stored separately, mirror the structure.

### 12.4 Covers folder

Create a dedicated folder for cover files. Covers are not assembled into the interior `.ODM` workflow; they are prepared separately.

---

## 13. LibreOffice Master Document Assembly

### 13.1 Copy the model `.ODM`

1. Locate the `.ODM` file ending in `model.odm` in the editable-files area.
2. Copy it into the target quarter folder, such as `Q1`.
3. Rename it for the target language and quarter.

Example pattern:

```text
LanguageName_Luke_Q1.odm
```

Use the local project’s established naming conventions if different.

### 13.2 Open the `.ODM` in LibreOffice

1. Open the renamed `.ODM` file in LibreOffice.
2. If prompted to verify or update links, allow it at this initial stage if you are still assembling from source files.
3. Open the master document view/sidebar if it is not already visible.

The master document view is where external `.ODT` files are linked into the master document.

### 13.3 Clear any placeholder content if needed

If working from a copied model that already contains linked content from another language or test assembly:

1. Remove the existing linked entries from the master view.
2. Do not delete the underlying lesson files from Google Drive.
3. Confirm the master view is ready to receive the TOC and lessons.

### 13.4 Insert the TOC first

Drag the TOC `.ODT` file from the file browser / Google Drive folder into the LibreOffice master document view.

The TOC must be first. Chris noted that for “quirky” LibreOffice reasons this is the first thing he must bring in. It may appear above or around a placeholder entry such as “Text”; adjust as needed so the TOC is at the top of the document content.

### 13.5 Sort lesson files descending in the file browser

In the Google Drive folder or local synced folder:

1. Sort the lesson files in descending order.
2. Select lessons 13 through 1.
3. Drag the selected lesson files into the master document view just under the TOC.

This reverse selection compensates for how LibreOffice inserts multiple dragged files. The end result should be:

```text
TOC
Lesson 1
Lesson 2
Lesson 3
...
Lesson 13
```

### 13.6 Confirm master document order

After dragging the lessons into the master view, confirm the visible order is correct:

1. TOC first.
2. Lesson 1 second.
3. Lessons continue sequentially through Lesson 13.

Do not proceed to export until the order is correct.

### 13.7 Understand linked documents

At this stage, LibreOffice has **linked** the external `.ODT` files into the `.ODM`; it has not truly imported them into a standalone editable file.

That means:

- Changes to the individual source `.ODT` files may be reflected if links are updated.
- The content may be protected and not directly editable in the assembled document.
- The assembled document must be exported to `.ODT` and then detached/unprotected before final editing.

---

## 14. Export ODM to ODT

### 14.1 Export as ODT

From the open `.ODM` file:

1. Go to `File → Export`.
2. Set the export file type to **ODT** / OpenDocument Text.
3. Name the file appropriately for language, book, quarter, output type, and editable status.
4. Save/export the file into the same quarter folder or the designated editable output folder.

### 14.2 Close the ODM

After export:

1. Save the `.ODM` if needed.
2. Close the `.ODM`.

The `.ODM` remains the assembly shell. The exported `.ODT` becomes the editable production file.

### 14.3 Open the exported ODT

1. Open the newly exported `.ODT`.
2. When LibreOffice asks whether to update links, click **Yes** the first time after export.

This pulls the linked content into the exported document.

---

## 15. Unlocking and Detaching the ODT

The exported `.ODT` initially contains linked/protected sections. You must unlock and detach it before editing.

### 15.1 Disable section write protection

In the exported `.ODT`:

1. Go to `Format → Sections`.
2. Select all sections in the right-hand pane.
3. Under **Write Protection**, clear/uncheck **Protect**.
4. Click **OK**.
5. Save the document.

The document should now be editable.

### 15.2 Remove external links / convert linked content to local content

Chris also removes the section links so the assembled `.ODT` becomes self-contained.

In `Format → Sections`:

1. Select each linked section.
2. Clear or remove the file/link reference for the section.
3. Keep the content.
4. Apply the changes.
5. Save.

The goal is to keep the assembled content while breaking the live connection to the original individual `.ODT` files.

### 15.3 Reopening after edits

After the `.ODT` has been unlocked, detached, and edited, LibreOffice may later prompt:

> This document contains one or more links to external data. Would you like to update all links?

Once you have made manual edits, click **No**.

Reason: updating links after manual edits can pull the document back toward the original linked content and may overwrite or interfere with the corrections you made in the assembled file.

Operational rule:

> During initial export/opening, update links. After manual edits begin, do not update links.

---

## 16. Document Properties and Footer Setup

### 16.1 Gather translated footer terms

Open Lesson 1 or the TOC and copy the target-language terms for:

- Quarter.
- Page.
- Lesson.

Keep these terms available while editing footers and coloring pages.

### 16.2 Update document properties

In the assembled `.ODT`:

1. Copy the target-language title from the TOC or front matter.
2. Go to `File → Properties`.
3. Open the **Description** tab.
4. Set **Title** to the target-language title.
5. Set **Subject** to the target-language equivalent of **Teacher’s Guide**.
6. Open **Custom Properties**.
7. Set **Number** to the quarter number.
   - For Q1, use `1`.
   - For Q2, use `2`.
   - For Q3, use `3`.
   - For Q4, use `4`.
8. Click **OK**.
9. Save.

The custom `Number` property is used by footers and/or field references in the document.

### 16.3 Fix front-matter footers

1. Scroll to a footer in the front matter.
2. Replace the term **Quarter** with the target-language equivalent.
3. Replace the term **Page** with the target-language equivalent.
4. Confirm the footer displays correctly.

### 16.4 Fix Lesson 1 footer

1. Scroll to a page in Lesson 1 where the footer is visible and not obscured by a floating image.
2. Click into the footer.
3. Replace:
   - Quarter.
   - Lesson.
   - Page.
4. Save.

### 16.5 Verify propagation

After updating the footer in one representative lesson page:

1. Scroll into later lessons.
2. Check several footers.
3. Confirm that the translated footer terms have propagated.
4. If they have not propagated, update the relevant page style or footer manually.

### 16.6 Fix coloring-page labels

Scroll to the coloring page(s). Under both images, replace:

- Quarter.
- Lesson.

Verify the labels under both images are correct.

---

## 17. Monolingual Front Matter Cleanup

For monolingual versions, some front-matter rows are redundant and should be removed.

### 17.1 Delete region / ISO / title rows

On the second page of the front matter:

1. Select the rows containing:
   - Region spoken.
   - ISO code.
   - Title.
2. Go to `Table → Delete → Rows`.
3. Confirm the rows are removed.

### 17.2 Delete duplicate TL title row

Delete the table row containing the name of the text in the target language if it duplicates the version below.

This is usually the last row of the table.

### 17.3 Adjust spacing

After deleting rows:

1. Review the page visually.
2. Adjust paragraph spacing so the page looks balanced.
3. Avoid introducing unnecessary manual formatting unless needed.

---

## 18. Visual QA and Formatting Pass

After unlocking and basic metadata cleanup, perform a complete visual pass through the assembled document.

### 18.1 Check lesson titles

For each lesson:

1. Confirm the title fits on the page.
2. If the title overflows or wraps badly, reduce the font size as needed.
3. Keep style consistency across lessons where possible.

### 18.2 Check pagination around images

LibreOffice may fail to paginate correctly when a picture container bleeds into the lower margin. This can leave an image extending below where it should fit.

During the QA pass:

1. Look especially for images near the bottom of pages.
2. If an image extends into or below the lower margin, manually move it or insert a page break so it begins on the next page.
3. Confirm the surrounding text still flows correctly.

### 18.3 Check Bible story picture placement

Bible story sections are especially prone to picture placement issues.

For each Bible story section:

1. Confirm every picture appears.
2. Confirm pictures are placed with the intended text.
3. Confirm pictures do not overlap text, headings, footers, or each other.
4. Confirm picture frames are not empty.

### 18.4 Fix empty image frames

Sometimes a frame appears empty even though the image is present in the document structure.

To recover the image:

1. Click inside the empty frame.
2. Place the cursor where the image should be, often to the right side of the frame.
3. Press **Delete**.
4. Press **Ctrl+Z** immediately.
5. The image should reappear.

This is a LibreOffice workaround Chris uses when images disappear visually.

### 18.5 Fix overlapping images

If pictures overlap:

1. Click/select the image frame.
2. Use the arrow keys to move the selected frame.
3. Make small movements and recheck the layout.
4. Confirm the image no longer overlaps content.

### 18.6 Check first pages of lessons

LibreOffice uses an invisible reference paragraph/string for lesson titles and chapter breaks. This structure allows the first page of a lesson to omit page numbers while the overall page count continues correctly.

Do not delete invisible or apparently blank structural material at the start of lessons unless you know exactly what it does.

If page numbering behaves strangely, check whether a chapter/lesson break or title reference was accidentally disturbed.

### 18.7 Check continuous page numbering

Modern output should continue page numbering across lessons rather than restarting every lesson.

Verify:

- Lesson 1 begins properly.
- Later lessons continue the quarter’s page sequence.
- The first page of each lesson follows the intended footer/page-number style.

### 18.8 Check paragraph highlighting

For print output, yellow highlighting used to identify mother-tongue translation content should be turned off through the relevant master paragraph style, not removed manually one instance at a time.

Chris changes the master paragraph style for mother-tongue translation paragraphs to remove background color. Because the styles are linked, the highlighting turns off throughout.

Do not manually clear highlighting paragraph by paragraph unless the style approach fails.

---

## 19. Saving the Editable ODT

### 19.1 Save after edits

When the document has been checked and corrected:

1. Save the `.ODT`.
2. Close and reopen it once if desired for verification.
3. If prompted to update links after edits, click **No**.
4. Verify edits remain intact.

### 19.2 Preserve the editable ODT

The final edited `.ODT` should be preserved in Google Drive. It is the production-editable source for the quarter, distinct from:

- The original individual downloaded lesson `.ODT` files.
- The `.ODM` assembly shell.
- The final PDF files.

---

## 20. Exporting the A4 Interior PDF

### 20.1 Export or print to PDF

From the final edited `.ODT`:

1. Export to PDF or print to PDF using LibreOffice.
2. Confirm page size is A4.
3. Save the PDF to the appropriate PDF output folder.

### 20.2 Verify the A4 PDF

Open the PDF and spot-check:

- First pages.
- Table of contents.
- Lesson transitions.
- Footers.
- Page numbers.
- Image-heavy sections.
- Final page.

The A4 PDF is the ordinary sequential interior file. It can be printed front and back and bound by comb binding or another simple binding method.

---

## 21. Creating the A3 Imposed Interior PDF

### 21.1 Use imposition software

Chris uses Cheap Imposter to create imposed A3 booklet PDFs.

Workflow:

1. Open the final A4 interior PDF in the imposition tool.
2. Choose A3 booklet/imposition output.
3. Export the imposed PDF.
4. Save with the appropriate A3 naming convention.

### 21.2 Verify imposed output

Open the A3 imposed PDF and check:

- Page spreads appear in booklet order, not sequential order.
- No pages are missing.
- Orientation is correct.
- Margins are acceptable.
- The file is suitable for staple binding.

### 21.3 Why A3 matters

A3 booklet printing with staple binding is often cheaper and more durable than other binding methods, if a local print shop can support it. However, some print shops may not be able to print or bind A3 booklets, so the ordinary A4 PDF is also supplied.

---

## 22. Cover Preparation

### 22.1 Covers are separate from the interior

Do not insert the cover into the `.ODM` / interior assembly process.

Covers are handled as separate files because:

- Covers are usually color.
- Interior pages are usually black and white.
- Print shops often print covers separately and then assemble them with the interior.

### 22.2 Copy the English cover file

1. Locate the English `.ODT` cover file for the correct book and quarter.
2. Copy it into the target language’s covers folder.
3. Rename it for the target language, book, quarter, and size.

### 22.3 Prepare both cover formats

There are two cover formats:

- A4 / cut-sheet cover.
- A3 / full-spread cover.

Prepare both if the final deliverable package requires both A4 and A3 output.

### 22.4 Update cover text manually

Open the copied cover `.ODT` and update all relevant text manually.

Potential cover fields include:

- Lessons from Luke / Lessons from Acts title.
- Quarter number.
- Teacher’s Guide.
- Copyright year.
- Publisher.
- Publisher address.
- Any language-specific title or subtitle.

Much of this text already exists in the translation work or table of contents, but the cover is not currently integrated into the platform. Therefore it does not auto-populate and must be edited manually.

### 22.5 Export cover PDFs

For each cover file:

1. Save the edited cover `.ODT`.
2. Export to PDF.
3. Confirm the page size:
   - A4 cover PDF for cut-sheet output.
   - A3 cover PDF for full-spread booklet output.
4. Save in the final PDF folder.

---

## 23. PDF Compression

Because internet connections may be poor, Chris uses PDF compression to reduce final file sizes without visibly degrading quality.

Workflow:

1. Open the final PDFs in the compression tool.
2. Compress/shrink each PDF.
3. Compare compressed output against the original.
4. Confirm images remain clear enough for printing.
5. Replace or store the compressed version according to local practice.

Do not compress so aggressively that Bible story images or cover artwork become visibly degraded.

---

## 24. Final Deliverable Package

For each quarter, the final package should normally include:

1. Editable assembled `.ODT` interior file.
2. A4 interior PDF.
3. A3 imposed interior PDF.
4. Editable A4 cover `.ODT`.
5. A4 cover PDF.
6. Editable A3 cover `.ODT`.
7. A3 cover PDF.
8. Original downloaded individual lesson `.ODT` files, unless archived elsewhere.
9. The `.ODM` assembly shell/model used to produce the quarter.

Depending on local practice, the original downloaded lesson files may remain in the quarter folder, while final PDFs go to a separate final PDF folder.

---

## 25. File Naming Convention

Use a consistent naming convention for final PDFs.

Original format from Chris’s process notes:

```text
Languagename_bookinTL_Q#(t#)_[TL equiv of monolingual or bilingual]_size.PDF
```

Interpretation:

- `Languagename` = target language name.
- `bookinTL` = book title in the target language.
- `Q#` = quarter number.
- `(t#)` = trimester marker, if used locally.
- `[TL equiv of monolingual or bilingual]` = output type in the target language.
- `size` = A4, A3, cover, imposed, or other agreed size descriptor.

Example template variants:

```text
LanguageName_LukeInTL_Q1_monolingual_A4.pdf
LanguageName_LukeInTL_Q1_monolingual_A3-imposed.pdf
LanguageName_LukeInTL_Q1_monolingual_A4-cover.pdf
LanguageName_LukeInTL_Q1_monolingual_A3-cover.pdf
```

Use the project’s established naming pattern if it differs, but ensure every filename clearly identifies:

- Language.
- Book.
- Quarter.
- Output type.
- Size.
- Whether it is cover or interior.

---

## 26. Final Google Drive Organization

When finished, ensure all files are in the appropriate Google Drive folders.

Suggested structure:

```text
LanguageName/
  Q1/
    downloaded-lesson-files/
    LanguageName_Luke_Q1.odm
    LanguageName_Luke_Q1_editable.odt
  Q2/
  Q3/
  Q4/
  Covers/
    LanguageName_Luke_Q1_cover_A4.odt
    LanguageName_Luke_Q1_cover_A4.pdf
    LanguageName_Luke_Q1_cover_A3.odt
    LanguageName_Luke_Q1_cover_A3.pdf
  PDFs/
    LanguageName_Luke_Q1_monolingual_A4.pdf
    LanguageName_Luke_Q1_monolingual_A3-imposed.pdf
```

If existing project folders use a different structure, follow the existing structure and avoid reorganizing old work unless explicitly instructed.

---

## 27. QA Checklist

Use this checklist before sending files to a translation team, church, print shop, or publication contact.

### 27.1 Platform/project checks

- [ ] Correct language project selected.
- [ ] Correct source/reference language selected.
- [ ] Correct output type selected: bilingual or monolingual.
- [ ] Scripture imported if available.
- [ ] USFM import report reviewed.
- [ ] USFM errors manually repaired.
- [ ] Required metadata entered in TOC.
- [ ] Project progress checked for missing strings.
- [ ] Triple-caret jump used to locate untranslated fields.

### 27.2 Download checks

- [ ] TOC downloaded.
- [ ] Lessons 1–13 downloaded.
- [ ] Files are from the correct book.
- [ ] Files are from the correct quarter.
- [ ] Files are the correct output type.
- [ ] Files are placed in the correct Google Drive folder.

### 27.3 Master document checks

- [ ] Model `.ODM` copied into quarter folder.
- [ ] `.ODM` renamed correctly.
- [ ] TOC inserted first.
- [ ] Lessons inserted beneath TOC.
- [ ] Lesson order verified as 1–13.
- [ ] `.ODM` exported as `.ODT`.
- [ ] Exported `.ODT` opened and links updated initially.
- [ ] Section write protection removed.
- [ ] External links removed/detached while preserving content.

### 27.4 Metadata and footer checks

- [ ] File properties title updated.
- [ ] File properties subject updated to target-language “Teacher’s Guide.”
- [ ] Custom Number property set to quarter number.
- [ ] Front-matter footer updated.
- [ ] Lesson footer updated.
- [ ] Coloring-page labels updated.
- [ ] Footer propagation checked in later lessons.

### 27.5 Monolingual cleanup checks

- [ ] Region spoken row removed if required.
- [ ] ISO code row removed if required.
- [ ] Duplicate title row removed if required.
- [ ] Page spacing adjusted after table row deletion.

### 27.6 Visual layout checks

- [ ] Lesson titles fit.
- [ ] Images appear.
- [ ] Empty frames fixed.
- [ ] Overlapping images fixed.
- [ ] Bottom-margin image problems fixed.
- [ ] Bible story sections reviewed carefully.
- [ ] Page numbering checked.
- [ ] First page of each lesson checked.
- [ ] Highlighting removed through style if appropriate.

### 27.7 PDF checks

- [ ] A4 interior PDF exported.
- [ ] A4 interior opened and spot-checked.
- [ ] A3 imposed PDF generated.
- [ ] A3 imposed PDF opened and spot-checked.
- [ ] A4 cover PDF generated.
- [ ] A3 cover PDF generated.
- [ ] PDFs compressed if needed.
- [ ] Compression quality checked.
- [ ] Files named correctly.
- [ ] Files placed in final Google Drive folders.

---

## 28. Troubleshooting Guide

### 28.1 USFM import says a passage failed

Likely cause: target-language versification differs from the reference language.

Fix:

1. Note the failed passage from the report.
2. Open the USFM/SFM text file.
3. Locate the corresponding passage.
4. Copy the Scripture content manually.
5. Paste it into the appropriate translation field.
6. Save.

Do not attempt to rewrite Scripture or force verse numbering to match unless explicitly directed by the translation authority.

### 28.2 A field is blank even though the project was previously published

Possible causes:

- The string was never translated.
- A source string changed and broke the translation link.
- The project predates some automation.
- A field was missed by translators.

Fix:

1. Use the triple-caret jump to identify missing fields.
2. Check the field history if available.
3. Fill the missing translation manually.
4. Save.
5. Consider checking similar fields elsewhere.

### 28.3 The original English project needs a correction

Do not edit it casually.

Escalate first. Editing source strings can destroy downstream translations and history.

### 28.4 Lesson files appear in the wrong order in the master document

Likely cause: files were not selected/dragged in the correct order.

Fix:

1. Remove the linked lesson entries from the master document view.
2. Sort the folder descending.
3. Select lessons 13 through 1.
4. Drag them under the TOC.
5. Verify final order is TOC, Lesson 1, Lesson 2, ... Lesson 13.

### 28.5 The exported ODT is not editable

Likely cause: section write protection is still enabled.

Fix:

1. Go to `Format → Sections`.
2. Select all sections.
3. Clear **Protect** under write protection.
4. Click **OK**.
5. Save.

### 28.6 Manual edits disappear after reopening

Likely cause: LibreOffice updated external links after you had already edited the assembled document.

Fix/prevention:

- After manual edits begin, answer **No** when LibreOffice asks whether to update links.
- Remove external section links after export so the `.ODT` becomes self-contained.

### 28.7 An image frame is empty

Fix:

1. Click inside the empty frame.
2. Put the cursor where the image should be.
3. Press **Delete**.
4. Press **Ctrl+Z**.
5. Confirm the image reappears.

### 28.8 An image overlaps another image or text

Fix:

1. Select the image frame.
2. Use arrow keys to nudge it into place.
3. Recheck nearby text and page boundaries.

### 28.9 An image bleeds into the lower margin

LibreOffice may not paginate correctly when picture containers extend into the lower margin.

Fix:

1. Move the image or its frame.
2. Insert a manual page break if necessary.
3. Confirm the image begins on the next page and the text flow remains correct.

### 28.10 Yellow highlighting appears in final print output

Fix:

1. Find the master mother-tongue translation paragraph style.
2. Remove the background color from the style.
3. Confirm all linked paragraph styles update.
4. Do not clear highlighting manually across hundreds of paragraphs unless style editing fails.

### 28.11 Page numbers restart every lesson

This was an issue in earlier versions. The current document structure should continue page numbering across lessons while allowing first lesson pages to suppress footers/page numbers.

Fix:

1. Check the paragraph styles and chapter-break structure at lesson starts.
2. Confirm invisible/structural lesson-title reference paragraphs were not deleted.
3. Compare against a known-good model file.

---

## 29. Operator Warnings

### 29.1 Do not treat LibreOffice links casually

The workflow intentionally passes through a linked-document stage and then breaks those links. The timing matters.

- Before export and initial opening: links are useful.
- After manual editing: links are dangerous.

### 29.2 Do not assume translators filled every reusable field

Translators often miss reference numbers, brackets, or other small repeated fields. The system may propagate these once filled correctly, but an operator must still check them.

### 29.3 Do not assume every project is safe to alter

There is no robust project locking in the platform. Completed projects can still be affected by source changes or other edits.

### 29.4 Do not assume Paratext access

Not everyone in the workflow has Paratext access or knows how to use it. The Lessons from Luke platform must remain usable by operators and partners who do not live inside Paratext.

### 29.5 Do not over-correct Scripture formatting

Scripture text comes from approved translation sources. The operator’s job is publication assembly, not Scripture editing.

---

## 30. Developer / Automation Notes

These are not steps for the ordinary publishing operator. They capture opportunities Chris identified for improving the software.

### 30.1 Download complete assembled quarter ODT

Desired feature:

- Download a complete quarter as a single `.ODT` file containing TOC plus lessons 1–13.
- The file should remain editable because manual cleanup is still required.
- PDF generation alone is insufficient; the operator must be able to inspect and fix layout before publication.

This would eliminate the manual step of downloading fourteen files and assembling them through LibreOffice master documents.

### 30.2 Include covers in the translation system

Desired feature:

- Add cover files to the platform in the same way TOC files were added.
- Allow cover text to auto-populate from existing translated strings and metadata.
- Recognize cover files by naming convention, such as `English_Luke-Q1-cover`, rather than treating them as unknown documents.

Rationale:

- Much cover text already exists in the translated curriculum or TOC metadata.
- Manual copy/paste into covers is repetitive and error-prone.

### 30.3 Auto-populate verse-reference numbers

Desired feature:

- When a project is created, automatically populate isolated verse-reference number strings, similar to how picture numbers are currently created.
- Make these fields editable so unusual cases can still be corrected manually.

Rationale:

- Translators often miss these fields.
- Once one reference is filled, it propagates elsewhere.
- Manual TOC copy/paste is currently repetitive.

### 30.4 Improve labels: “mother tongue,” “standard,” and “single language”

Suggested terminology:

- Replace **mother tongue** with **bilingual** or another clearer project-mode label.
- Replace **standard** with **bilingual**.
- Keep or clarify **single language** as **monolingual**.

Rationale:

- Current terminology is opaque to new operators.
- “Mother tongue” describes the original idea but not the publication output clearly.

### 30.5 Project deletion and locking

Desired features:

- Delete or archive abandoned projects.
- Lock completed/reference projects.
- Protect source projects from accidental edits that destroy translation history.

Rationale:

- Current workflow relies on operator discipline.
- Source-string edits can damage downstream translations.

### 30.6 Re-import translated documents

Open question:

- If a translated document is exported to another tool such as Paratext and then edited, can it be re-imported without losing the language as a reference project?

Chris’s concern:

- The team should not assume every partner has Paratext.
- The platform should preserve reference languages and not strand communities outside the web/offline app workflow.

### 30.7 Recognize style-driven string structures

The system appears to depend heavily on consistent paragraph styles and source document structure. Chris intentionally used naming conventions such as `MT` for mother-tongue translation paragraph styles and `English translation` styles for replicated/reference content.

Automation should preserve and exploit these style conventions rather than flattening them.

### 30.8 Preserve editable output after automation

Any automation that assembles full quarter files must still leave room for human layout QA.

A fully automated PDF is not enough because LibreOffice layout problems remain, especially:

- Footer irregularities.
- Pagination issues.
- Floating image placement.
- Empty or overlapping image frames.
- Lesson title overflow.

---

## 31. Glossary

**A3**  
Large paper size used for imposed booklet printing.

**A4**  
Standard paper size used for ordinary sequential PDFs and cut-sheet printing.

**Bilingual document**  
A document where teaching content is translated into the local language while lesson mechanics remain in a major language such as French or English. In the platform this is associated with “mother tongue” or “standard” output.

**Cheap Imposter**  
PDF imposition software Chris uses to create A3 booklet PDFs from A4 PDFs.

**Cover file**  
Separate LibreOffice `.ODT` file used to create color cover PDFs. Currently edited manually outside the main platform.

**LibreOffice master document**  
An `.ODM` file that links multiple `.ODT` files into one assembled document.

**Monolingual document**  
A full single-language document. In the platform this is associated with “single language” output.

**ODM**  
LibreOffice master document format. Used as the assembly shell for TOC plus lessons.

**ODT**  
LibreOffice/OpenDocument Text file. The platform outputs lessons as `.ODT`; the assembled editable book is also exported as `.ODT`.

**Paratext**  
Bible translation software used by translators. Scripture is exported from Paratext as USFM/SFM.

**PDF Shrink**  
Software Chris uses to reduce PDF file size for easier sharing.

**SFM / USFM**  
Standard Format Marker / Unified Standard Format Marker text files used for Scripture text exported from Paratext.

**TOC**  
Table of Contents. Treated as a special document in the platform and must be inserted first in the LibreOffice master document.

**Translation history**  
The platform’s stored history of edits for a translation string. This can be lost if source strings are modified improperly.

---

## 32. Condensed Operator Checklist

Use this once you already understand the full SOP.

1. Confirm language project, source language, and output type.
2. Upload USFM if needed; repair any import errors.
3. Fill/check TOC metadata and repeating fields.
4. Download TOC plus lessons 1–13 for one quarter.
5. Create language/quarter folders in Google Drive.
6. Copy and rename model `.ODM` into the quarter folder.
7. Open `.ODM`; insert TOC first.
8. Sort lessons descending; drag lessons 13–1 under TOC.
9. Confirm order is TOC, 1, 2, ... 13.
10. Export `.ODM` to `.ODT`.
11. Open `.ODT`; update links initially.
12. `Format → Sections`; unprotect all sections.
13. Remove external section links while keeping content.
14. Update file properties: title, subject, quarter number.
15. Update front-matter and lesson footers.
16. Update coloring-page labels.
17. For monolingual output, remove redundant front-matter rows.
18. Review all lessons for title fit, image placement, pagination, and footers.
19. Save final editable `.ODT`.
20. Reopen if desired; click **No** if asked to update links after edits.
21. Export A4 interior PDF.
22. Create A3 imposed interior PDF.
23. Copy/edit/export A4 and A3 covers.
24. Compress PDFs if needed.
25. Rename files according to convention.
26. Place editable files and PDFs in correct Google Drive folders.

---

## 33. Open Questions for Follow-Up

1. What exact Google Drive folder structure should be standardized across all future languages?
2. What is the authoritative naming convention for Luke vs. Acts, bilingual vs. monolingual, and A3 vs. A4?
3. Should cover `.ODT` files be stored with quarter files or only in a covers folder?
4. Which exact LibreOffice version should be recommended?
5. Should PDF compression be required for all PDFs or only for email delivery?
6. What quality threshold should be used after PDF shrinking?
7. Should verse-reference headings be corrected to target versification when USFM differs, or left as source/reference by default?
8. Who has authority to approve source-project edits?
9. How should completed projects be marked as “do not edit” until software locking exists?
10. What screenshots should be added to the final training version of this SOP?

---

## 34. Suggested Screenshot List for Training Version

A future training edition should include screenshots for:

1. Administrator language list.
2. Language project administrator page.
3. Upload USFM button and import report.
4. Translation interface with highlighted fields.
5. Triple-caret jump button.
6. Bilingual example showing local language plus French/English reference text.
7. Monolingual example showing replicated target-language text.
8. TOC metadata fields.
9. Download links: standard vs. single language.
10. Google Drive quarter folder.
11. LibreOffice master document view.
12. TOC inserted into `.ODM`.
13. Lessons selected in reverse order.
14. Correct master-document order.
15. `File → Export` to `.ODT`.
16. Link-update prompt.
17. `Format → Sections` window.
18. Write-protection checkbox.
19. Section-link removal.
20. File properties Description tab.
21. Custom Properties `Number` field.
22. Footer field before/after correction.
23. Monolingual front-matter rows to delete.
24. Empty image frame example.
25. Image overlap example.
26. Image lower-margin pagination issue.
27. PDF export settings.
28. Cheap Imposter A3 imposition settings.
29. A4 and A3 cover files.
30. Final Google Drive deliverables folder.
