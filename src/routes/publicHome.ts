import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";

interface Options {
  failedLogin?: boolean;
}

export default function publicHome(options: Options) {
  const errorMessage = options.failedLogin ? "Sorry, that didn't work." : "";
  return Mustache.render(getTemplate("loginForm"), { errorMessage });
}
