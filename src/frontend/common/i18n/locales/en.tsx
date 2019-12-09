const en = {
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
  serverError: "Server Error %{status}"
};

export type I18nStrings = typeof en;
export type I18nKey = keyof I18nStrings;
export default en;
