export interface User {
  id: string;
  admin: boolean;
}

export interface LoginAttempt {
  email: string;
  password: string;
}
