interface TStrings {
  [language: string]: {
    [key: string]: string;
  };
}

export interface Translations {
  [key: string]: string;
}

const tStrings: TStrings = {
  English: {
    Lessons: "Lessons",
    Save: "Save",
    Saved: "Saved",
    Locked: "Locked",
    LockedMessage: "This project is locked for desktop translation.",
    needToSync: "Changes saved on this computer",
    synced: "Changes saved on this computer and uploaded.",
    DownloadingLessons: "Downloading Lessons...",
    DownloadError: "Download Error",
    TryAgain: "Try Again"
  },
  Français: {
    Lessons: "Leçons",
    Save: "Enregistrer",
    Saved: "Enregistré",
    Locked: "Verrouillé",
    LockedMessage: "Ce projet est verrouillé pour traduction hors ligne.",
    needToSync: "Changements enregistrés à cet ordinateur.",
    synced: "Changements enregistrés à cet ordinateur et téléchargés.",
    DownloadingLessons: "Téléchargement des leçons...",
    DownloadError: "Erreur de téléchargement",
    TryAgain: "Réessayer"
  }
};

export default function i18n(language: string) {
  const primaryT = tStrings[language] || {};
  return { ...tStrings.English, ...primaryT };
}
