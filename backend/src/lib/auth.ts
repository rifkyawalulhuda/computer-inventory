import crypto from "crypto";

export type AuthRole = "admin" | "user";

export type AuthTokenPayload = {
  sub: string;
  role: AuthRole;
  email: string;
  name: string;
  iat: number;
  exp: number;
};

const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || "change-this-auth-secret";
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60 * 12; // 12 hours

function base64UrlEncode(value: string | Buffer): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value: string): string {
  const normalized = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function signToken(unsignedToken: string): string {
  return base64UrlEncode(
    crypto.createHmac("sha256", TOKEN_SECRET).update(unsignedToken).digest(),
  );
}

function areEqualSignatures(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createAuthToken(
  payload: {
    id: string;
    role: AuthRole;
    email: string;
    name: string;
  },
  expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload: AuthTokenPayload = {
    sub: payload.id,
    role: payload.role,
    email: payload.email,
    name: payload.name,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerPart = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadPart = base64UrlEncode(JSON.stringify(tokenPayload));
  const unsignedToken = `${headerPart}.${payloadPart}`;
  const signature = signToken(unsignedToken);

  return `${unsignedToken}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const unsignedToken = `${headerPart}.${payloadPart}`;
  const expectedSignature = signToken(unsignedToken);
  if (!areEqualSignatures(signaturePart, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadPart)) as Partial<AuthTokenPayload>;
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const role = payload.role === "admin" || payload.role === "user" ? payload.role : null;
    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const iat = typeof payload.iat === "number" ? payload.iat : 0;
    const exp = typeof payload.exp === "number" ? payload.exp : 0;

    if (!role || !sub || !email || !name || !iat || !exp) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (exp <= now) {
      return null;
    }

    return {
      sub,
      role,
      email,
      name,
      iat,
      exp,
    };
  } catch {
    return null;
  }
}
