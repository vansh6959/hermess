export type ImportErrorKind =
  | "connect"
  | "scope"
  | "config"
  | "auth"
  | "error";

export class ImportRequestError extends Error {
  kind: ImportErrorKind;

  constructor(kind: ImportErrorKind, message: string) {
    super(message);
    this.name = "ImportRequestError";
    this.kind = kind;
  }
}
