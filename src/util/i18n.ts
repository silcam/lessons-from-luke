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
    Locked: "Locked",
    LockedMessage: "This project is locked for desktop translation.",
    needToSync: "Changes saved on this computer",
    synced: "Changes saved on this computer and uploaded."
  },
  Français: {
    Lessons: "Leçons",
    Save: "Enregistrer",
    Locked: "Verrouillé",
    LockedMessage: "Ce projet est verrouillé pour traduction hors ligne.",
    needToSync: "Changements enregistrés à cet ordinateur.",
    synced: "Changements enregistrés à cet ordinateur et téléchargés."
  }
};

export default function i18n(language: string) {
  const primaryT = tStrings[language] || {};
  return { ...tStrings.English, ...primaryT };
}
