interface TStrings {
  [language: string]: {
    [key: string]: string;
  };
}

const tStrings: TStrings = {
  English: {
    Lessons: "Lessons",
    Save: "Save"
  },
  Français: {
    Lessons: "Leçons",
    Save: "Enregistrer"
  }
};

export default function i18n(language: string) {
  const primaryT = tStrings[language] || {};
  return { ...tStrings.English, ...primaryT };
}
