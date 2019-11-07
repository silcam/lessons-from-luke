import { Request, Response, NextFunction } from "express";
import layout from "./layout";

export default async function catchError(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  res
    .status(500)
    .send(layout("<p class='error'>Sorry, there was an error.</p>"));
  if (err !== "Test Error") console.error(err);
}
