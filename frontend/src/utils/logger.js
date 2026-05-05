/**
 * Lightweight logger that only emits in development.
 * Avoids leaking errors/log noise to end-user consoles in production
 * while preserving full debugging output during local development.
 */
const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  log: (...args) => { if (isDev) console.log(...args); },
  info: (...args) => { if (isDev) console.info(...args); },
  warn: (...args) => { if (isDev) console.warn(...args); },
  error: (...args) => { if (isDev) console.error(...args); },
  debug: (...args) => { if (isDev) console.debug(...args); },
};

export default logger;
