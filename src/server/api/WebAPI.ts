import {
  GetRoute,
  PostRoute,
  APIPost,
  APIGet
} from "../../core/interfaces/Api";
import { Express, Request } from "express";

export type GetRequestHandler<T extends GetRoute> = (
  req: Request
) => Promise<APIGet[T][1]>;
export type PostRequestHandler<T extends PostRoute> = (
  req: Request
) => Promise<APIPost[T][2]>;

export function addGetHandler<T extends GetRoute>(
  app: Express,
  route: T,
  handler: GetRequestHandler<T>
) {
  app.get(route, async (req, res) => {
    const result = await handler(req);
    res.json(result);
  });
}

export function addPostHandler<T extends PostRoute>(
  app: Express,
  route: T,
  handler: PostRequestHandler<T>
) {
  app.post(route, async (req, res) => {
    try {
      const result = await handler(req);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).send();
    }
  });
}
