import { resetTestStorage } from "../testHelper";
import MockDate from "mockdate";

test("none", () => {
  expect(true).toBe(true);
});

// beforeAll(() => {
//   MockDate.set(1554891104714);
// });

// afterAll(() => {
//   MockDate.reset();
// });

// beforeEach(() => {
//   resetTestStorage();
// });

// test("Add new lesson version", () => {
//   Manifest.addSourceLesson("English", "Luke-Q1-L01");
//   const manifest = Manifest.readSourceManifest();
//   expect(manifest.length).toBe(1);
//   expect(manifest[0].lessons.length).toBe(1);
//   expect(manifest[0].lessons[0].versions.length).toBe(2);
//   expect(manifest[0].lessons[0].versions[1]).toEqual({
//     version: 2,
//     projects: []
//   });
// });

// test("Add new lesson", () => {
//   Manifest.addSourceLesson("English", "Luke-Q1-L02");
//   const manifest = Manifest.readSourceManifest();
//   expect(manifest.length).toBe(1);
//   expect(manifest[0].lessons.length).toBe(2);
//   expect(manifest[0].lessons[1]).toEqual({
//     lesson: "Luke-Q1-L02",
//     versions: [{ version: 1, projects: [] }]
//   });
// });

// test("Add new language", () => {
//   Manifest.addSourceLanguage("Français");
//   const manifest = Manifest.readSourceManifest();
//   expect(manifest.length).toBe(2);
//   expect(manifest[1]).toEqual({
//     language: "Français",
//     lessons: [],
//     projects: []
//   });
// });

// test("Add new project", () => {
//   Manifest.addProject("English", "Lingala");
//   expect(Manifest.readSourceManifest()).toEqual([
//     {
//       language: "English",
//       lessons: [
//         {
//           lesson: "Luke-Q1-L01",
//           versions: [
//             {
//               projects: ["Pidgin_1555081479425", "Lingala_1554891104714"],
//               version: 1
//             }
//           ]
//         }
//       ],
//       projects: ["Pidgin_1555081479425", "Lingala_1554891104714"]
//     }
//   ]);
//   expect(Manifest.readProjectManifest(1554891104714)).toEqual({
//     datetime: 1554891104714,
//     lessons: [{ lesson: "Luke-Q1-L01", version: 1 }],
//     sourceLang: "English",
//     targetLang: "Lingala"
//   });
// });

// test("projectSrcUpdatesAvailable", () => {
//   expect(Manifest.projectSrcUpdatesAvailable(1555081479425)).toEqual([]);
//   Manifest.addSourceLesson("English", "Luke-Q1-L01"); // Add a new version of lesson 1
//   expect(Manifest.projectSrcUpdatesAvailable(1555081479425)).toEqual([[0, 2]]);
// });

// test("updateProjectLessonSrc", () => {
//   Manifest.addSourceLesson("English", "Luke-Q1-L01"); // Add a new version of lesson 1
//   // Check everything before we update
//   let source = Manifest.readSourceManifest("English");
//   expect(source.lessons[0].versions[0].projects).toEqual([
//     "Pidgin_1555081479425"
//   ]);
//   expect(source.lessons[0].versions[1].projects).toEqual([]);
//   let project = Manifest.readProjectManifest(1555081479425);
//   expect(project.lessons[0].version).toEqual(1);

//   // Update
//   Manifest.updateProjectLessonSrc(1555081479425, 0, 2);

//   // Verify everything is correctly updated
//   source = Manifest.readSourceManifest("English");
//   expect(source.lessons[0].versions[0].projects).toEqual([]);
//   expect(source.lessons[0].versions[1].projects).toEqual([
//     "Pidgin_1555081479425"
//   ]);
//   project = Manifest.readProjectManifest(1555081479425);
//   expect(project.lessons[0].version).toEqual(2);
// });
