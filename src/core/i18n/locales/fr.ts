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
  No_connection_check:
    "Aucune connexion au serveur. Veuillez vérifier votre connexion internet.",
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
  Changes_saved: "Enregistré",
  Enter_your_code: "Saisir le code que vous avez reçu :",
  Language: "Langue",
  Online: "En ligne",
  Offline: "Hors ligne",
  Code_error:
    "Échec de trouver un projet de traduction. Veuillez vérifier que vous avez le bon adresse.",
  Code_error_for_desktop:
    "Échec de trouver un projet de traduction. Veuillez vérifier que vous avez le bon code.",
  Syncing_project: "Synchronisation du projet %{language}...",
  Synced_project: "Projet de %{language} synchronisé",
  Texts: "Textes",
  Previews: "Aperçus",
  Downloading: "Téléchargement",
  Uploading: "Chargement",
  Start_translating: "Commencer la traduction",
  History: "Historique",
  Resync_explanation:
    "Vous voulez réinitialiser ce projet et télécharger toutes les données à nouveau ?",
  Yes_resync: "Oui, réinitialiser",
  Cancel: "Annuler"
};

export default fr;
