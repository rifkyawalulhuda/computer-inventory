import bcrypt from "bcryptjs";
import { Router } from "express";
import { createAuthToken } from "../lib/auth";
import {
  getUserProfilePhotoRelativePath,
  saveUserProfilePhoto,
} from "../lib/profile-photo";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseProfilePayload(payload: unknown): {
  contact: string;
  rank: string;
  profilePhotoDataUrl: string | null;
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload tidak valid.");
  }

  const body = payload as Record<string, unknown>;
  const contact = cleanText(body.contact);
  const rank = cleanText(body.rank);
  const profilePhotoDataUrlRaw = cleanText(body.profilePhotoDataUrl);

  if (!contact || contact.length > 50) {
    throw new Error("Contact wajib diisi (maksimal 50 karakter).");
  }

  if (!rank || rank.length > 50) {
    throw new Error("Rank wajib diisi (maksimal 50 karakter).");
  }

  return {
    contact,
    rank,
    profilePhotoDataUrl: profilePhotoDataUrlRaw ? profilePhotoDataUrlRaw : null,
  };
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
        contact: true,
        rank: true,
        jobCode: {
          select: {
            code: true,
            siteName: true,
          },
        },
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

    const profilePhotoUrl = await getUserProfilePhotoRelativePath(user.id);

    return res.json({
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          email: user.email,
          jobCodeId: user.jobCodeId,
          jobCode: user.jobCode,
          contact: user.contact,
          rank: user.rank,
          profilePhotoUrl,
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
        contact: true,
        rank: true,
        jobCode: {
          select: {
            code: true,
            siteName: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const profilePhotoUrl = await getUserProfilePhotoRelativePath(user.id);
    return res.json({
      data: {
        ...user,
        profilePhotoUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.patch("/auth/profile", requireAuth, async (req, res, next) => {
  try {
    const userId = cleanText(req.authUser?.id);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const payload = parseProfilePayload(req.body);
    const updated = await prisma.masterUser.update({
      where: { id: userId },
      data: {
        contact: payload.contact,
        rank: payload.rank,
      },
      select: {
        id: true,
        name: true,
        role: true,
        email: true,
        jobCodeId: true,
        contact: true,
        rank: true,
        jobCode: {
          select: {
            code: true,
            siteName: true,
          },
        },
      },
    });

    let profilePhotoUrl = await getUserProfilePhotoRelativePath(userId);
    if (payload.profilePhotoDataUrl) {
      profilePhotoUrl = await saveUserProfilePhoto(userId, payload.profilePhotoDataUrl);
    }

    return res.json({
      data: {
        ...updated,
        profilePhotoUrl,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});
