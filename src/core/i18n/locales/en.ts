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
  No_connection_check: "No connection to server. Please check your internet.",
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
  Code_error_for_desktop:
    "Translation Project not found. Please check that you have the right code.",
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
  Log_out: "Log Out",
  Translate: "Translate",
  Upload_usfm: "Upload USFM",
  Upload_document: "Upload Document",
  X_scripture: "%{language} Scripture",
  Errors: "Errors",
  Imported_texts: "Imported Texts",
  Split: "Split",
  Split_instructions:
    "Place the cursor where you want the split and then press the Split button.",
  Upload: "Upload",
  Mother_tongue: "Mother Tongue",
  Pick_a_lesson: "Pick a lesson",
  Source_language: "Source Language",
  Server_error: "Server Error (%{status})",
  No_connection: "No Connection",
  Unknown_error: "Unknown Error",
  Unsaved_changes: "Unsaved Changes",
  Changes_saved: "Changes Saved",
  Download: "Download",
  Enter_your_code: "Enter the code you were given:",
  Language: "Language",
  Online: "Online",
  Offline: "Offline",
  Syncing_project: "Syncing %{language} project...",
  Synced_project: "%{language} Synced",
  Texts: "Texts",
  Previews: "Previews",
  Downloading: "Downloading",
  Uploading: "Uploading",
  Start_translating: "Start Translating",
  History: "History"
};

export type I18nStrings = typeof en;
export type I18nKey = keyof I18nStrings;
export default en;
