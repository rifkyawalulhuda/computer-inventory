import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "computer-inventory-api",
    timestamp: new Date().toISOString(),
  });
});