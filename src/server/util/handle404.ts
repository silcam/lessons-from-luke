import { Request, Response } from "express";
import layout from "./layout";

export default function handle404(req: Request, res: Response) {
  res.status(404).send(layout("<p class='error'>Sorry, not found.</p>"));
}
