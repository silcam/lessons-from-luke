export type Book = "Luke" | "Acts";

export interface Lesson {
  lessonId: number;
  book: Book;
  series: number;
  lesson: number;
}
