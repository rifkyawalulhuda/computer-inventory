import type { AuthRole } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        role: AuthRole;
        email: string;
        name: string;
      };
    }
  }
}

export {};
