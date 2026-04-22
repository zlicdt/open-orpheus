export function stringifyError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message + "\n" + error.stack;
  }
  return String(error);
}
