import Mustache from "mustache";
import { getTemplate } from "./getTemplate";

export default function layout(content: string) {
  return Mustache.render(getTemplate("layout"), { content });
}
