import type { ILogger, LogEntry } from "./interfaces.js";
import type { LogLevel } from "./constants.js";
import { LOG_LEVELS } from "./constants.js";

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  fatal: "\x1b[35m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

export type LogHandler = (entry: LogEntry) => void;

export class Logger implements ILogger {
  private minLevel: number;
  private handlers: LogHandler[] = [];

  constructor(
    private level: LogLevel = "info",
    private serviceName?: string,
    private defaultContext: Record<string, unknown> = {},
    private traceId?: string,
  ) {
    this.minLevel = LOG_LEVELS[level];
  }

  addHandler(handler: LogHandler): void {
    this.handlers.push(handler);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }

  fatal(message: string, context?: Record<string, unknown>): void {
    this.log("fatal", message, context);
  }

  child(ctx: Record<string, unknown>): ILogger {
    const child = new Logger(
      this.level,
      (ctx["service"] as string) ?? this.serviceName,
      { ...this.defaultContext, ...ctx },
      (ctx["traceId"] as string) ?? this.traceId,
    );
    for (const h of this.handlers) child.addHandler(h);
    return child;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < this.minLevel) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: { ...this.defaultContext, ...context },
      service: this.serviceName,
      traceId: this.traceId,
    };

    this.write(entry);
    for (const h of this.handlers) {
      try {
        h(entry);
      } catch {
        /* never break logging */
      }
    }
  }

  private write(entry: LogEntry): void {
    const color = LEVEL_COLORS[entry.level];
    const time = new Date(entry.timestamp).toISOString();
    const lvl = entry.level.toUpperCase().padEnd(5);
    const svc = entry.service ? ` ${BOLD}[${entry.service}]${RESET}` : "";
    const trace = entry.traceId ? ` trace=${entry.traceId}` : "";
    const ctx =
      entry.context && Object.keys(entry.context).length > 0
        ? ` ${JSON.stringify(entry.context)}`
        : "";

    const line = `${color}${time} ${lvl}${RESET}${svc} ${entry.message}${trace}${ctx}`;

    if (entry.level === "error" || entry.level === "fatal") {
      console.error(line);
    } else {
      console.log(line); // eslint-disable-line no-console
    }
  }
}
