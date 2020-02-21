export interface User {
  id: number;
  admin: boolean;
}

export interface LoginAttempt {
  username: string;
  password: string;
}
