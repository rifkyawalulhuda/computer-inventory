import bcrypt from "bcryptjs";
import { Router } from "express";
import { createAuthToken } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

authRouter.post("/auth/login", async (req, res, next) => {
  try {
    const email = cleanText((req.body as Record<string, unknown>)?.email).toLowerCase();
    const password = cleanText((req.body as Record<string, unknown>)?.password);

    if (!email || !password) {
      return res.status(400).json({ message: "Email dan password wajib diisi." });
    }

    const user = await prisma.masterUser.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        role: true,
        email: true,
        passwordHash: true,
        jobCodeId: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    const token = createAuthToken({
      id: user.id,
      role: user.role as "admin" | "user",
      email: user.email,
      name: user.name,
    });

    return res.json({
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          email: user.email,
          jobCodeId: user.jobCodeId,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/auth/me", requireAuth, async (req, res, next) => {
  try {
    const userId = cleanText(req.authUser?.id);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const user = await prisma.masterUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        email: true,
        jobCodeId: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    return res.json({ data: user });
  } catch (error) {
    next(error);
  }
});
