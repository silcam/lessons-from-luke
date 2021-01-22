export function escapeHTML(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function onlyWhitespace(text: string) {
  return !/\S/.test(text);
}
