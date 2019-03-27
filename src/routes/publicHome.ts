import fs from "fs";
import Mustache from "mustache";

interface Options {
  failedLogin?: boolean;
}

export default function publicHome(options: Options) {
  const template = fs.readFileSync("views/loginForm.html.mustache").toString();
  const errorMessage = options.failedLogin ? "Sorry, that didn't work." : "";
  return Mustache.render(template, { errorMessage });
}
