export function jobErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && typeof Reflect.get(error, "message") === "string"
        ? (Reflect.get(error, "message") as string)
        : "";
  const missingNode = message.match(/Node ['"]([^'"]+)['"] not found/i)?.[1];
  if (missingNode) {
    return `ComfyUI is missing the "${missingNode}" node. Install the node packs listed in the README and restart ComfyUI.`;
  }
  if (/value not in list/i.test(message)) {
    return `ComfyUI is missing a model file this engine needs (see docs/models.md). Details: ${message}`;
  }
  return message || "ComfyUI could not run this workflow. Check the ComfyUI window for the error.";
}
