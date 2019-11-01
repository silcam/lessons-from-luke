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
    TryAgain: "Try Again",
    DoneWorking: "I'm done working on this project.",
    Finish: "Finish",
    NoConnection: "No connection to server.",
    UnknownError: "Unexpected error",
    writeLockInvalid:
      "The translation project is no longer locked to this computer. Please contact the system administrator to continue translation."
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
    TryAgain: "Réessayer",
    DoneWorking: "J'ai terminé mon travail sur ce projet.",
    Finish: "Terminer",
    NoConnection: "Aucune connexion au serveur.",
    UnknownError: "Erreur inattendu",
    writeLockInvalid:
      "Le projet de traduction n'est plus verrouillé pour cet ordinateur. Veuillez contacter l'administrateur si vous voulez continuer la traduction."
  }
};

export default function i18n(language: string) {
  const primaryT = tStrings[language] || {};
  return { ...tStrings.English, ...primaryT };
}

export function languages() {
  return Object.keys(tStrings);
}
