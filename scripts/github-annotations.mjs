// GitHub annotations for CI failures (since 2026-11-15).
//
// A job log is not readable from every place a failure is looked at, but a check run's
// annotations are: they come back from the check-runs API and show on the pull request.
// So the workflow emits one `::error` workflow command for each failing test, and one for the
// verifier's message, which GitHub turns into annotations on the run.
//
// Two uses:
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//     --test-reporter=./scripts/github-annotations.mjs --test-reporter-destination=stdout …
//   node scripts/github-annotations.mjs <title> < stderr.txt   (prints one annotation, or none)

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// GitHub caps an annotation's message; past this the rest is in the job log anyway.
export const MAX_MESSAGE = 4000;

// A workflow command's data: `%`, CR and LF are escaped, or the command ends early.
export function escapeData(text) {
  return String(text).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

// A property also ends at `:` or `,`, so those are escaped too.
export function escapeProperty(text) {
  return escapeData(text).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

export function annotation({ title, file, line, message }) {
  let body = String(message ?? "").trim() || "(no message)";
  if (body.length > MAX_MESSAGE) body = `${body.slice(0, MAX_MESSAGE)}\n… (cut; the job log has the rest)`;
  const properties = [];
  if (file) properties.push(`file=${escapeProperty(file)}`);
  if (file && Number.isInteger(line) && line > 0) properties.push(`line=${line}`);
  if (title) properties.push(`title=${escapeProperty(title)}`);
  return `::error${properties.length ? ` ${properties.join(",")}` : ""}::${escapeData(body)}\n`;
}

// The message of an uncaught error as Node prints it: from the first `Error:` line (or any
// `SomethingError:`) up to its stack. A run that printed no such line yields its whole text.
export function uncaughtMessage(stderr) {
  const lines = String(stderr).replaceAll("\r\n", "\n").split("\n");
  const start = lines.findIndex((text) => /^[A-Za-z]*Error(?: \[[A-Z_]+\])?: /.test(text));
  if (start < 0) return String(stderr).trim();
  const end = lines.findIndex((text, index) => index > start && /^\s+at /.test(text));
  const message = lines.slice(start, end < 0 ? undefined : end).join("\n");
  return message.replace(/^[A-Za-z]*Error(?: \[[A-Z_]+\])?: /, "").trim();
}

// What failed in a `test:fail` event, or null when the failure is only that a subtest failed
// (that subtest has its own event, and one annotation per failure is the point).
export function testFailure(data, cwd = process.cwd()) {
  const error = data?.details?.error;
  if (!error || error.failureType === "subtestsFailed") return null;
  const cause = error.code === "ERR_TEST_FAILURE" && error.cause ? error.cause : error;
  const message = cause instanceof Error ? cause.message : String(cause);
  let file = data.file;
  if (file) {
    if (file.startsWith("file:")) file = fileURLToPath(file);
    file = relative(cwd, file).split("\\").join("/");
  }
  return { title: `Test failed: ${data.name}`, file, line: data.line, message };
}

export default async function* githubAnnotations(source) {
  for await (const event of source) {
    if (event.type !== "test:fail") continue;
    const failure = testFailure(event.data);
    if (failure) yield annotation(failure);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const title = process.argv[2] || "Failed";
  const stderr = readFileSync(0, "utf8");
  if (stderr.trim()) process.stdout.write(annotation({ title, message: uncaughtMessage(stderr) }));
}
