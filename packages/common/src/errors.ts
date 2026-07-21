export class RyvanError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RyvanError";
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export class ServiceNotFoundError extends RyvanError {
  constructor(name: string) {
    super(`Service "${name}" not found`, "SERVICE_NOT_FOUND", { name });
    this.name = "ServiceNotFoundError";
  }
}

export class ServiceAlreadyRegisteredError extends RyvanError {
  constructor(name: string) {
    super(`Service "${name}" already registered`, "SERVICE_ALREADY_REGISTERED", { name });
    this.name = "ServiceAlreadyRegisteredError";
  }
}

export class ConfigError extends RyvanError {
  constructor(key: string, reason: string) {
    super(`Config "${key}": ${reason}`, "CONFIG_ERROR", { key, reason });
    this.name = "ConfigError";
  }
}

export class ValidationError extends RyvanError {
  constructor(field: string, reason: string) {
    super(`Validation failed for "${field}": ${reason}`, "VALIDATION_ERROR", { field, reason });
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends RyvanError {
  constructor(reason: string) {
    super(`Authentication failed: ${reason}`, "AUTHENTICATION_ERROR", { reason });
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends RyvanError {
  constructor(action: string, resource: string) {
    super(`Unauthorized: "${action}" on "${resource}"`, "AUTHORIZATION_ERROR", {
      action,
      resource,
    });
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends RyvanError {
  constructor(resource: string, id: string) {
    super(`${resource} "${id}" not found`, "NOT_FOUND", { resource, id });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends RyvanError {
  constructor(resource: string, reason: string) {
    super(`Conflict on "${resource}": ${reason}`, "CONFLICT", { resource, reason });
    this.name = "ConflictError";
  }
}

export class TimeoutError extends RyvanError {
  constructor(operation: string, timeoutMs: number) {
    super(`"${operation}" timed out after ${timeoutMs}ms`, "TIMEOUT", { operation, timeoutMs });
    this.name = "TimeoutError";
  }
}

export class RateLimitError extends RyvanError {
  constructor(key: string, retryAfterMs: number) {
    super(`Rate limit exceeded for "${key}"`, "RATE_LIMIT", { key, retryAfterMs });
    this.name = "RateLimitError";
  }
}

export class PluginError extends RyvanError {
  constructor(plugin: string, reason: string) {
    super(`Plugin "${plugin}": ${reason}`, "PLUGIN_ERROR", { plugin, reason });
    this.name = "PluginError";
  }
}

export class ConnectorError extends RyvanError {
  constructor(connector: string, reason: string) {
    super(`Connector "${connector}": ${reason}`, "CONNECTOR_ERROR", { connector, reason });
    this.name = "ConnectorError";
  }
}

export class AgentError extends RyvanError {
  constructor(agentId: string, reason: string) {
    super(`Agent "${agentId}": ${reason}`, "AGENT_ERROR", { agentId, reason });
    this.name = "AgentError";
  }
}

export class WorkflowError extends RyvanError {
  constructor(workflowId: string, reason: string) {
    super(`Workflow "${workflowId}": ${reason}`, "WORKFLOW_ERROR", { workflowId, reason });
    this.name = "WorkflowError";
  }
}

export class ModelError extends RyvanError {
  constructor(model: string, reason: string) {
    super(`Model "${model}": ${reason}`, "MODEL_ERROR", { model, reason });
    this.name = "ModelError";
  }
}

export class KernelStateError extends RyvanError {
  constructor(current: string, action: string) {
    super(`Cannot ${action} kernel in "${current}" state`, "KERNEL_STATE_ERROR", {
      current,
      action,
    });
    this.name = "KernelStateError";
  }
}
