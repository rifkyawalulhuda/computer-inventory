import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/auth";

export const masterUserRouter = Router();

type BaseUserPayload = {
  name: string;
  role: "admin" | "user";
  email: string;
  contact: string;
  rank: string;
  jobCodeId: number;
};

function parseBasePayload(payload: unknown): BaseUserPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload tidak valid.");
  }

  const body = payload as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const role = String(body.role ?? "").trim().toLowerCase();
  const email = String(body.email ?? "").trim().toLowerCase();
  const contact = String(body.contact ?? "").trim();
  const rank = String(body.rank ?? "").trim();
  const jobCodeId = Number(body.jobCodeId);

  if (name.length < 1 || name.length > 100) {
    throw new Error("Name wajib diisi (maksimal 100 karakter).");
  }

  if (role !== "admin" && role !== "user") {
    throw new Error("Role wajib dipilih (admin/user).");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
    throw new Error("Email tidak valid.");
  }

  if (contact.length < 1 || contact.length > 50) {
    throw new Error("Contact wajib diisi (maksimal 50 karakter).");
  }

  if (rank.length < 1 || rank.length > 50) {
    throw new Error("Rank wajib diisi (maksimal 50 karakter).");
  }

  if (!Number.isInteger(jobCodeId) || jobCodeId < 1) {
    throw new Error("Site Code wajib dipilih.");
  }

  return { name, role: role as "admin" | "user", email, contact, rank, jobCodeId };
}

function parsePassword(raw: unknown, isRequired: boolean): string | null {
  const password = String(raw ?? "").trim();
  if (!password) {
    if (isRequired) {
      throw new Error("Password wajib diisi.");
    }

    return null;
  }

  if (password.length < 6 || password.length > 100) {
    throw new Error("Password minimal 6 karakter dan maksimal 100 karakter.");
  }

  return password;
}

masterUserRouter.get("/master-users", async (req, res, next) => {
  try {
    const requestedJobCodeIdRaw = String(req.query.jobCodeId ?? "").trim();
    const requestedJobCodeId = requestedJobCodeIdRaw ? Number(requestedJobCodeIdRaw) : null;

    if (requestedJobCodeIdRaw && (!Number.isInteger(requestedJobCodeId) || (requestedJobCodeId as number) < 1)) {
      return res.status(400).json({ message: "Site Code filter tidak valid." });
    }

    let effectiveJobCodeId: number | null = Number.isInteger(requestedJobCodeId) && (requestedJobCodeId as number) > 0
      ? (requestedJobCodeId as number)
      : null;

    if (req.authUser?.role === "user") {
      const currentUser = await prisma.masterUser.findUnique({
        where: { id: req.authUser.id },
        select: { jobCodeId: true },
      });

      if (!currentUser) {
        return res.status(404).json({ message: "User login tidak ditemukan." });
      }

      effectiveJobCodeId = currentUser.jobCodeId;
    }

    const rows = await prisma.masterUser.findMany({
      where: effectiveJobCodeId ? { jobCodeId: effectiveJobCodeId } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        jobCode: true,
      },
    });

    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      email: row.email,
      contact: row.contact,
      rank: row.rank,
      jobCodeId: row.jobCodeId,
      jobCode: row.jobCode,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

masterUserRouter.post("/master-users", requireRole("admin"), async (req, res, next) => {
  try {
    const payload = parseBasePayload(req.body);
    const password = parsePassword((req.body as Record<string, unknown>)?.password, true);

    const jobCode = await prisma.department.findUnique({ where: { id: payload.jobCodeId } });
    if (!jobCode) {
      return res.status(400).json({ message: "Site Code tidak ditemukan." });
    }

    const passwordHash = await bcrypt.hash(password as string, 10);

    const created = await prisma.masterUser.create({
      data: {
        ...payload,
        passwordHash,
      },
      include: {
        jobCode: true,
      },
    });

    res.status(201).json({
      data: {
        id: created.id,
        name: created.name,
        role: created.role,
        email: created.email,
        contact: created.contact,
        rank: created.rank,
        jobCodeId: created.jobCodeId,
        jobCode: created.jobCode,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Email sudah digunakan." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

masterUserRouter.put("/master-users/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const payload = parseBasePayload(req.body);
    const password = parsePassword((req.body as Record<string, unknown>)?.password, false);

    const jobCode = await prisma.department.findUnique({ where: { id: payload.jobCodeId } });
    if (!jobCode) {
      return res.status(400).json({ message: "Site Code tidak ditemukan." });
    }

    const dataToUpdate: {
      name: string;
      role: "admin" | "user";
      email: string;
      contact: string;
      rank: string;
      jobCodeId: number;
      passwordHash?: string;
    } = {
      ...payload,
    };

    if (password) {
      dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.masterUser.update({
      where: { id },
      data: dataToUpdate,
      include: {
        jobCode: true,
      },
    });

    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        role: updated.role,
        email: updated.email,
        contact: updated.contact,
        rank: updated.rank,
        jobCodeId: updated.jobCodeId,
        jobCode: updated.jobCode,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Email sudah digunakan." });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ message: "Data tidak ditemukan." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

masterUserRouter.delete("/master-users/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    await prisma.masterUser.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ message: "Data tidak ditemukan." });
    }

    next(error);
  }
});
