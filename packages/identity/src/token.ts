import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { AuthenticationError, ValidationError } from "@ryvan/common";
import type { TokenPayload } from "./types.js";

export interface TokenManagerConfig {
  secret: string;
  expiresIn: string;
  issuer: string;
}

export class TokenManager {
  private readonly secret: string;
  private readonly expiresIn: string;
  private readonly issuer: string;

  constructor(config: TokenManagerConfig) {
    if (!config.secret) {
      throw new ValidationError("secret", "must not be empty");
    }
    if (config.secret.length < 32) {
      throw new ValidationError("secret", "must be at least 32 characters for HMAC-SHA256");
    }
    if (!config.expiresIn) {
      throw new ValidationError("expiresIn", "must not be empty");
    }
    if (!config.issuer) {
      throw new ValidationError("issuer", "must not be empty");
    }
    this.secret = config.secret;
    this.expiresIn = config.expiresIn;
    this.issuer = config.issuer;
  }

  sign(payload: Omit<TokenPayload, "iat" | "exp">): string {
    if (!payload.sub) {
      throw new ValidationError("sub", "must not be empty");
    }

    const options: SignOptions = {
      expiresIn: this.expiresIn as SignOptions["expiresIn"],
      issuer: this.issuer,
    };

    return jwt.sign(
      {
        sub: payload.sub,
        org: payload.org,
        roles: payload.roles,
        permissions: payload.permissions,
      },
      this.secret,
      options,
    );
  }

  verify(token: string): TokenPayload {
    if (!token) {
      throw new ValidationError("token", "must not be empty");
    }

    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: this.issuer,
      }) as jwt.JwtPayload;

      if (
        typeof decoded.sub !== "string" ||
        typeof decoded.org !== "string" ||
        !Array.isArray(decoded.roles) ||
        !Array.isArray(decoded.permissions) ||
        typeof decoded.iat !== "number" ||
        typeof decoded.exp !== "number"
      ) {
        throw new AuthenticationError("malformed token: missing or invalid claims");
      }

      return {
        sub: decoded.sub,
        org: decoded.org,
        roles: decoded.roles as string[],
        permissions: decoded.permissions as string[],
        iat: decoded.iat,
        exp: decoded.exp,
      };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError("token has expired");
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError("invalid token");
      }
      throw new AuthenticationError("token verification failed");
    }
  }

  decode(token: string): TokenPayload | null {
    if (!token) return null;

    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    if (!decoded) return null;

    return {
      sub: decoded.sub as string,
      org: decoded.org as string,
      roles: decoded.roles as string[],
      permissions: decoded.permissions as string[],
      iat: decoded.iat as number,
      exp: decoded.exp as number,
    };
  }

  refresh(token: string): string {
    const payload = this.verify(token);
    return this.sign({
      sub: payload.sub,
      org: payload.org,
      roles: payload.roles,
      permissions: payload.permissions,
    });
  }
}
