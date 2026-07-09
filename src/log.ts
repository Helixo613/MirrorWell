// src/log.ts — console-only logger (docs/BACKEND.md §4). No remote logging, crash reporting,
// or telemetry, ever — that would be a network call carrying health-adjacent data.
//
// debug/info are stripped from production builds: `import.meta.env.DEV` is a compile-time
// constant Vite replaces with a literal, so the ternary below collapses to the `noop` branch
// and esbuild's dead-code elimination removes the console.* call entirely. warn/error always
// survive production — this file therefore lives outside src/dev/ (which is dropped from
// prod builds wholesale).
//
// Never log: landmark arrays, frames, or camera-derived data at warn/error (these survive in
// prod consoles); any strings.ts string interpolated with metric values (keeps health data
// out of logs) — see docs/BACKEND.md §4.
type LogFn = (scope: string, msg: string, data?: object) => void;

const noop: LogFn = () => {};

export const log: { debug: LogFn; info: LogFn; warn: LogFn; error: LogFn } = {
  debug: import.meta.env.DEV ? (scope, msg, data) => console.debug(`[${scope}]`, msg, data ?? '') : noop,
  info: import.meta.env.DEV ? (scope, msg, data) => console.info(`[${scope}]`, msg, data ?? '') : noop,
  warn: (scope, msg, data) => console.warn(`[${scope}]`, msg, data ?? ''),
  error: (scope, msg, data) => console.error(`[${scope}]`, msg, data ?? ''),
};
