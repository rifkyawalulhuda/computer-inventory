import { Router } from "express";
import { prisma } from "../lib/prisma";

export const deviceRouter = Router();

deviceRouter.get("/devices", async (_req, res, next) => {
  try {
    const devices = await prisma.device.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        model: true,
        location: true,
        jobCode: true,
        ipAddresses: true,
        leaseContracts: {
          orderBy: { endDate: "desc" },
          take: 1,
        },
      },
    });

    res.json({ data: devices });
  } catch (error) {
    next(error);
  }
});