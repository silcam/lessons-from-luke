const en = {
  Luke: "Luke",
  Acts: "Acts",
  Lessons: "Lessons",
  Save: "Save",
  Saved: "Saved",
  Locked: "Locked",
  LockedMessage: "This project is locked for desktop translation.",
  needToSync: "Changes saved on this computer",
  synced: "Changes saved on this computer and uploaded.",
  DownloadingLessons: "Downloading Lessons...",
  DownloadError: "Download Error",
  TryAgain: "Try Again",
  DoneWorking: "I'm done working on this project.",
  Finish: "Finish",
  NoConnection: "No connection to server",
  UnknownError: "Unexpected error",
  writeLockInvalid:
    "The translation project is no longer locked to this computer. Please contact the system administrator to continue translation.",
  serverError: "Server Error %{status}",
  Log_in: "Log In",
  Username: "Username",
  Password: "Password",
  Log_in_failed: "Login failed.",
  Code_error:
    "Translation Project not found. Please check that you have the right web address.",
  Start_translating_lesson: "Start Translating %{name}",
  Languages: "Languages",
  Add_language: "Add Language",
  Language_name: "Language Name",
  Cancel: "Cancel",
  Add_lesson: "Add Lesson",
  Upload_new_lesson: "Upload New Lesson",
  Series: "Series",
  Lesson: "Lesson",
  Add_file: "Add File",
  Book: "Book",
  Edit: "Edit",
  Ok: "Ok",
  Merge_next: "Merge Next",
  Merge_next_with_space: "Merge Next with Space",
  Delete: "Delete",
  Home: "Home",
  Log_out: "Log Out"
};

export type I18nStrings = typeof en;
export type I18nKey = keyof I18nStrings;
export default en;
