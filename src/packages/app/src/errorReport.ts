const STACK_MAX = 3000;
const COMPONENTS_MAX = 1500;

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more characters)` : text);

/** What one thrown value says about itself: its name and message, and its stack when that adds to them. */
function describe(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const head = `${e.name}: ${e.message}`;
  const stack = e.stack ?? "";
  // Some engines start the stack with the message, others only list the frames.
  return cut(stack.includes(e.message) ? stack : `${head}\n${stack}`.trimEnd(), STACK_MAX);
}

/**
 * The text of the error screen's code box, written to be pasted into a bug report: when it happened, what was thrown
 * (and what caused it, one level down), and the components being drawn.
 */
export function errorReport(error: unknown, componentStack: string | null | undefined, now: Date): string {
  const parts = ["OhMatrix error report", `time: ${now.toISOString()}`, "", describe(error)];
  const cause = error instanceof Error ? (error as { cause?: unknown }).cause : undefined;
  if (cause !== undefined) parts.push("", "Caused by:", describe(cause));
  if (componentStack?.trim()) parts.push("", "Component stack:", cut(componentStack.trim(), COMPONENTS_MAX));
  return parts.join("\n");
}
