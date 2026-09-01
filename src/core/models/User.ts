export interface User {
  id: string;
  admin: boolean;
  /** Display name from better-auth; present on get-session responses. */
  name?: string;
  /** Email address from better-auth; present on get-session responses. */
  email?: string;
}
