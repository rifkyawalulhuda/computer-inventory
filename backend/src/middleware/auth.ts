import { type NextFunction, type Request, type Response } from "express";
import { verifyAuthToken } from "../lib/auth";

function parseBearerToken(req: Request): string {
  const header = String(req.header("authorization") ?? "").trim();
  if (!header) {
    return "";
  }

  const [scheme, token] = header.split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return "";
  }

  return token.trim();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = parseBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "Unauthorized. Token dibutuhkan." });
    return;
  }

  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ message: "Unauthorized. Token tidak valid atau sudah expired." });
    return;
  }

  req.authUser = {
    id: payload.sub,
    role: payload.role,
    email: payload.email,
    name: payload.name,
  };

  next();
}

export function requireRole(...allowedRoles: Array<"admin" | "user">) {
  const normalizedAllowedRoles = allowedRoles.filter((role) => role === "admin" || role === "user");

  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.authUser?.role;

    if (!role || !normalizedAllowedRoles.includes(role)) {
      res.status(403).json({ message: "Forbidden. Anda tidak memiliki akses ke resource ini." });
      return;
    }

    next();
  };
}
