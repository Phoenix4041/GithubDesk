export type NameProblem = "empty" | "start" | "characters" | "reserved" | "long";

export function nameProblem(name: string): NameProblem | null {
  if (name === "") {
    return "empty";
  }
  if (name.length > 100) {
    return "long";
  }
  if (!/^[A-Za-z_]/.test(name)) {
    return "start";
  }
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    return "characters";
  }
  if (name.toUpperCase().startsWith("GITHUB_")) {
    return "reserved";
  }
  return null;
}

export const MAX_VALUE_BYTES = 48 * 1024;

export function valueBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function valueProblem(value: string): "empty" | "large" | null {
  if (value === "") {
    return "empty";
  }
  return valueBytes(value) > MAX_VALUE_BYTES ? "large" : null;
}

export type Visibility = "all" | "private";

export function shortValue(value: string, limit = 60): string {
  const single = value.replace(/\s+/g, " ").trim();
  return single.length > limit ? `${single.slice(0, limit - 3)}...` : single;
}
