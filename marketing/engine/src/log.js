// Tiny logger. Everything goes to stderr (stdout is reserved for the CLI's single JSON result) and is kept in a
// bounded buffer that `run finish` saves into runs.log. LOG_QUIET=1 silences stderr (the buffer is still kept).
import { inspect } from 'node:util';

const MAX_BUFFER = 400_000; // characters kept for runs.log (tail wins)
let buffer = [];
let size = 0;
const quiet = /^(1|true|yes|on)$/i.test(String(process.env.LOG_QUIET ?? ''));

const fmt = (args) =>
  args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack || a.message : inspect(a, { depth: 4, breakLength: 120 }))).join(' ');

function push(level, args) {
  const line = `${new Date().toISOString()} ${level === 'info' ? '' : `[${level}] `}${fmt(args)}`;
  if (!quiet) process.stderr.write(`${line}\n`);
  buffer.push(line);
  size += line.length + 1;
  while (size > MAX_BUFFER && buffer.length > 1) size -= buffer.shift().length + 1;
}

export function log(...args) {
  push('info', args);
}
log.warn = (...args) => push('warn', args);
log.error = (...args) => push('error', args);

export const warn = log.warn;
export const logError = log.error;

/** Everything logged so far in this process (bounded), newline separated. */
export function getLogText() {
  return buffer.join('\n');
}

export function resetLog() {
  buffer = [];
  size = 0;
}
