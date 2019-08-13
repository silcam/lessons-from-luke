interface TStrings {
  [language: string]: {
    [key: string]: string;
  };
}

const tStrings: TStrings = {
  English: {
    Lessons: "Lessons",
    Save: "Save",
    Locked: "Locked",
    LockedMessage: "This project is locked for desktop translation."
  },
  Français: {
    Lessons: "Leçons",
    Save: "Enregistrer",
    Locked: "Verrouillé",
    LockedMessage: "Ce projet est verrouillé pour traduction hors ligne."
  }
};

export default function i18n(language: string) {
  const primaryT = tStrings[language] || {};
  return { ...tStrings.English, ...primaryT };
}
