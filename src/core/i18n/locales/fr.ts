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
  No_connection_check: "Aucune connexion au serveur. Veuillez vérifier votre connexion internet.",
  UnknownError: "Erreur inattendu",
  writeLockInvalid:
    "Le projet de traduction n'est plus verrouillé pour cet ordinateur. Veuillez contacter l'administrateur si vous voulez continuer la traduction.",
  serverError: "Erreur de serveur : %{status}",
  Email: "Adresse e-mail",
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
  Cancel: "Annuler",

  // User management feature — Users roster + role/access control (US1-US4)
  Users_page_heading: "Utilisateurs",
  Users_column_name: "Nom",
  Users_column_email: "Adresse e-mail",
  Users_column_role: "Rôle",
  Users_column_status: "Statut",
  Users_column_created: "Créé",
  Users_column_actions: "Actions",
  Users_self_marker: "Vous",
  Users_status_active: "Actif",
  Users_status_deactivated: "Désactivé",
  Users_loading: "Chargement des utilisateurs…",
  Users_load_error: "Impossible de charger les utilisateurs. Veuillez réessayer.",
  Users_empty_state: "Aucun utilisateur pour le moment.",

  // Users feature — Promote/Demote (US3)
  Users_action_promote: "Promouvoir",
  Users_action_demote: "Rétrograder",
  Users_action_demote_confirm: "Confirmer la rétrogradation",
  Users_demote_confirm_prompt:
    "Rétrograder cet administrateur au rôle Standard ? Il perdra ses droits d'administration.",
  Users_demote_self_confirm_prompt:
    "Vous rétrograder vous-même au rôle Standard ? Vous perdrez immédiatement vos droits d'administration.",

  // Users feature — Deactivate/Reactivate (US2)
  Users_action_deactivate: "Désactiver",
  Users_action_reactivate: "Réactiver",
  Users_action_deactivate_confirm: "Confirmer la désactivation",
  Users_deactivate_confirm_prompt:
    "Désactiver ce compte ? L'utilisateur sera déconnecté immédiatement et ne pourra pas se connecter tant que le compte n'est pas réactivé.",
  Users_reactivate_credential_help:
    "La réactivation restaure le mot de passe existant de cet utilisateur. À utiliser uniquement pour un utilisateur de retour — pas pour récupérer un compte compromis. Pour renouveler un identifiant compromis, invitez la personne à nouveau avec une autre adresse e-mail.",

  // Users feature — Force sign-out (US4)
  Users_action_force_sign_out: "Forcer la déconnexion",
  Users_action_force_sign_out_confirm: "Confirmer la déconnexion forcée",
  Users_force_sign_out_confirm_prompt:
    "Forcer la déconnexion de cet utilisateur ? Ses sessions actives se termineront immédiatement ; le compte restera actif.",
  Users_force_sign_out_self_confirm_prompt:
    "Vous forcer vous-même à vous déconnecter ? Cela vous déconnectera sur cet appareil.",

  // Users feature — accessible guardrail-refusal reasons (WCAG — not disabled-attribute-only)
  Users_guardrail_self_deactivate: "Impossible de désactiver votre propre compte",
  Users_guardrail_last_admin_demote: "Impossible de rétrograder le dernier administrateur",
  Users_guardrail_last_admin_deactivate: "Impossible de désactiver le dernier administrateur",
};

export default fr;
