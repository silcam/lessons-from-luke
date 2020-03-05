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
  serverError: "Erreur de serveur : %{status}",
  Source_language: "Langue source :",
  Pick_a_lesson: "Choisissez une leçon",
  Server_error: "Erreur de serveur (%{status})",
  No_connection: "Aucune connexion",
  Unknown_error: "Erreur inconnu",
  Unsaved_changes: "Modifications non enregistrées",
  Changes_saved: "Enregistré"
};

export default fr;
