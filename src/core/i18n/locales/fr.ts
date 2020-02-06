import en, { I18nStrings } from "./en";

const fr: I18nStrings = {
  ...en,
  Lessons: "Leçons",
  Luke: "Luc",
  Acts: "Actes",
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
    "Le projet de traduction n'est plus verrouillé pour cet ordinateur. Veuillez contacter l'administrateur si vous voulez continuer la traduction.",
  serverError: "Erreur de serveur : %{status}"
};

export default fr;
