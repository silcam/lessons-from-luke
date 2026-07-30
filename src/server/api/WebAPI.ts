import { GetRoute, PostRoute, APIPost, APIGet } from "../../core/interfaces/Api";
import { Express, Request, Response } from "express";

export type GetRequestHandler<T extends GetRoute> = (req: Request) => Promise<APIGet[T][1]>;
export type PostRequestHandler<T extends PostRoute> = (req: Request) => Promise<APIPost[T][2]>;

export function addGetHandler<T extends GetRoute>(
  app: Express,
  route: T,
  handler: GetRequestHandler<T>
) {
  app.get(route, async (req, res) => {
    handleErrors(res, async () => {
      const result = await handler(req);
      res.json(result);
    });
  });
}

export function addPostHandler<T extends PostRoute>(
  app: Express,
  route: T,
  handler: PostRequestHandler<T>
) {
  app.post(route, async (req, res) => {
    handleErrors(res, async () => {
      const result = await handler(req);
      res.json(result);
    });
  });
}

export async function handleErrors(res: Response, cb: () => Promise<void>) {
  try {
    await cb();
  } catch (err) {
    const rawStatus = err.status;
    const status =
      Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : 500;
    res.status(status).send();
    if (status == 500) {
      console.error(err);
      // In tests the handler often outlives the failing test, so jest drops
      // the console.error above; raw stderr bypasses jest's console capture.
      if (process.env.NODE_ENV === "test") {
        const detail = err instanceof Error ? (err.stack ?? err.message) : JSON.stringify(err);
        process.stderr.write(`[handleErrors] 500: ${detail}\n`);
      }
    }
  }
}
