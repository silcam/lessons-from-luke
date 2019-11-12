import { Source } from "../Source";
import { User, LoginAttempt } from "../User";

export type Params = { [key: string]: string };

export interface APIGet {
  "/api/sources": [{}, Source[]];
  "/api/sources/:language": [{ language: string }, Source];
  "/api/users/current": [{}, User | null];
}

export interface APIPost {
  "/api/users/login": [{}, LoginAttempt, User | null];
  "/api/users/logout": [{}, null, null];
}

export type GetRoute = keyof APIGet;
export type PostRoute = keyof APIPost;
