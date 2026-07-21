import type { z } from "zod";
import type { IConfigManager } from "./interfaces.js";
import { ConfigError } from "./errors.js";

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function safeGet(obj: Record<string, unknown>, key: string): unknown {
  if (FORBIDDEN_KEYS.has(key)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
  return obj[key];
}

function safeSet(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (FORBIDDEN_KEYS.has(key)) {
    throw new ConfigError(key, `key segment "${key}" is not allowed`);
  }
  obj[key] = value;
}

export class ConfigManager implements IConfigManager {
  private store = new Map<string, unknown>();

  get<T>(key: string, defaultValue?: T): T {
    const value = this.resolve(key);
    if (value === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      throw new ConfigError(key, "not found and no default");
    }
    return value as T;
  }

  set(key: string, value: unknown): void {
    const parts = key.split(".");
    for (const part of parts) {
      if (FORBIDDEN_KEYS.has(part)) {
        throw new ConfigError(key, `key segment "${part}" is not allowed`);
      }
    }
    if (parts.length === 1) {
      this.store.set(key, value);
      return;
    }
    const existing = this.store.get(parts[0]);
    let obj: Record<string, unknown>;
    if (existing != null && typeof existing !== "object") {
      throw new ConfigError(
        parts[0],
        `cannot set nested key "${key}" — "${parts[0]}" is already a non-object value (${typeof existing})`,
      );
    }
    if (!existing || typeof existing !== "object") {
      obj = Object.create(null) as Record<string, unknown>;
      this.store.set(parts[0], obj);
    } else {
      obj = existing as Record<string, unknown>;
    }
    let current = obj;
    for (let i = 1; i < parts.length - 1; i++) {
      const child = safeGet(current, parts[i]);
      if (!child || typeof child !== "object") {
        const next = Object.create(null) as Record<string, unknown>;
        safeSet(current, parts[i], next);
        current = next;
      } else {
        current = child as Record<string, unknown>;
      }
    }
    safeSet(current, parts[parts.length - 1], value);
  }

  has(key: string): boolean {
    return this.resolve(key) !== undefined;
  }

  load(config: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(config)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const existing = this.store.get(key);
        if (existing && typeof existing === "object" && !Array.isArray(existing)) {
          this.store.set(
            key,
            this.merge(existing as Record<string, unknown>, value as Record<string, unknown>),
          );
          continue;
        }
      }
      this.store.set(key, structuredClone(value));
    }
  }

  loadFromEnv(prefix = "RYVAN_"): void {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value !== undefined) {
        const configKey = key
          .slice(prefix.length)
          .toLowerCase()
          .replace(/__/g, ".")
          .replace(/_/g, "-");
        this.set(configKey, this.parseEnv(value));
      }
    }
  }

  validate<T>(key: string, schema: z.ZodSchema<T>): T {
    const value = this.get(key);
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new ConfigError(key, result.error.issues.map((i) => i.message).join("; "));
    }
    return result.data;
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.store) result[key] = value;
    return result;
  }

  private resolve(key: string): unknown {
    if (this.store.has(key)) return this.store.get(key);
    const parts = key.split(".");
    let current: unknown = this.store.get(parts[0]);
    for (let i = 1; i < parts.length; i++) {
      if (current == null || typeof current !== "object") return undefined;
      const value = safeGet(current as Record<string, unknown>, parts[i]);
      if (value === undefined) return undefined;
      current = value;
    }
    return current;
  }

  private merge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };
    for (const [k, v] of Object.entries(source)) {
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        result[k] &&
        typeof result[k] === "object" &&
        !Array.isArray(result[k])
      ) {
        result[k] = this.merge(result[k] as Record<string, unknown>, v as Record<string, unknown>);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  private parseEnv(value: string): unknown {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== "") return num;
    return value;
  }
}
