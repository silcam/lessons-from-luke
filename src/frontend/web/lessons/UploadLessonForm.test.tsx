import { metaFromFilename } from "./UploadLessonForm";
import { COVER_A4_LESSON, COVER_A3_LESSON } from "../../../core/models/Lesson";

describe("metaFromFilename", () => {
  describe("cover-format detection", () => {
    it.each([
      ["English-Luke-T1-Cover-A4.odt", "Luke", 1, COVER_A4_LESSON],
      ["English-Luke-T2-Cover-A4.odt", "Luke", 2, COVER_A4_LESSON],
      ["English-Luke-T3-Cover-A4.odt", "Luke", 3, COVER_A4_LESSON],
      ["English-Luke-T4-Cover-A4.odt", "Luke", 4, COVER_A4_LESSON],
      ["English-Luke-Q1-Cover-A3.odt", "Luke", 1, COVER_A3_LESSON],
      ["English-Luke-Q2-Cover-A3.odt", "Luke", 2, COVER_A3_LESSON],
      ["English-Luke-Q3-Cover-A3.odt", "Luke", 3, COVER_A3_LESSON],
      ["English-Luke-Q4-Cover-A3.odt", "Luke", 4, COVER_A3_LESSON],
    ])("maps %s to book %s, series %i, lesson %i", (filename, book, series, lesson) => {
      const meta = metaFromFilename(filename);
      expect(meta.book).toEqual(book);
      expect(meta.series).toEqual(series);
      expect(meta.lesson).toEqual(lesson);
    });

    it("detects Cover-A4 case-insensitively", () => {
      const meta = metaFromFilename("English-Luke-Q1-cover-a4.odt");
      expect(meta.lesson).toEqual(COVER_A4_LESSON);
    });

    it("detects Cover-A3 case-insensitively", () => {
      const meta = metaFromFilename("English-Luke-T1-COVER-A3.odt");
      expect(meta.lesson).toEqual(COVER_A3_LESSON);
    });

    it("does not treat an ordinary lesson filename as a cover", () => {
      const meta = metaFromFilename("English-Luke-Q1-L06.odt");
      expect(meta.book).toEqual("Luke");
      expect(meta.series).toEqual(1);
      expect(meta.lesson).toEqual(6);
    });
  });
});
