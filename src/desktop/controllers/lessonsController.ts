import { addGetHandler } from "../DesktopAPIServer";
import DesktopApp from "../DesktopApp";
import { findBy } from "../../core/util/arrayUtils";

export default function lessonsController(app: DesktopApp) {
  const { localStorage } = app;

  addGetHandler("/api/lessons", async () => {
    return localStorage.getLessons();
  });

  addGetHandler("/api/lessons/:lessonId", async ({ lessonId }) => {
    const lesson = findBy(localStorage.getLessons(), "lessonId", lessonId);
    const lessonStrings = localStorage.getLessonStrings(lessonId);
    if (!lesson || !lessonStrings) throw { status: 404 };
    return { ...lesson, lessonStrings };
  });

  addGetHandler("/api/lessons/:lessonId/webified", async ({ lessonId }) => {
    const preview = localStorage.getDocPreview(lessonId);
    if (!preview) throw { status: 404 };
    return { html: preview };
  });
}
//
