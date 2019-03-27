import secrets from "./secrets";

interface AuthParams {
  username: string;
  password: string;
}

export default function authenticate(params: AuthParams) {
  return (
    params.username === secrets.adminUsername &&
    params.password === secrets.adminPassword
  );
}
