import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma";

export const masterJobCodeRouter = Router();

type JobCodePayload = {
  code: string;
  siteName: string;
  address: string;
  phoneNumber: string;
};

function parsePayload(payload: unknown): JobCodePayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload tidak valid.");
  }

  const body = payload as Record<string, unknown>;
  const code = String(body.code ?? "").trim().toUpperCase();
  const siteName = String(body.siteName ?? "").trim();
  const address = String(body.address ?? "").trim();
  const phoneNumber = String(body.phoneNumber ?? "").trim();

  if (!/^[A-Z]{1,5}$/.test(code)) {
    throw new Error("Job Code wajib 1-5 huruf (A-Z).");
  }

  if (siteName.length < 1 || siteName.length > 30) {
    throw new Error("Site Name wajib diisi (maksimal 30 karakter).");
  }

  if (address.length < 1) {
    throw new Error("Address wajib diisi.");
  }

  if (phoneNumber.length < 1 || phoneNumber.length > 30) {
    throw new Error("Telp. Number wajib diisi (maksimal 30 karakter).");
  }

  return { code, siteName, address, phoneNumber };
}

masterJobCodeRouter.get("/master-job-codes", async (_req, res, next) => {
  try {
    const rows = await prisma.jobCode.findMany({
      orderBy: { code: "asc" },
      include: {
        _count: {
          select: {
            devices: true,
          },
        },
      },
    });

    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

masterJobCodeRouter.post("/master-job-codes", async (req, res, next) => {
  try {
    const payload = parsePayload(req.body);

    const created = await prisma.jobCode.create({
      data: payload,
    });

    res.status(201).json({ data: created });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Job Code sudah ada." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

masterJobCodeRouter.put("/master-job-codes/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const payload = parsePayload(req.body);

    const updated = await prisma.jobCode.update({
      where: { id },
      data: payload,
    });

    res.json({ data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Job Code sudah ada." });
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

masterJobCodeRouter.delete("/master-job-codes/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const row = await prisma.jobCode.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            devices: true,
          },
        },
      },
    });

    if (!row) {
      return res.status(404).json({ message: "Data tidak ditemukan." });
    }

    if (row._count.devices > 0) {
      return res.status(409).json({
        message: "Job Code tidak bisa dihapus karena sudah dipakai data device.",
      });
    }

    await prisma.jobCode.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});