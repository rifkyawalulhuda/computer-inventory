import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "path";
import { requireAuth } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { deviceRecordRouter } from "./routes/device-records";
import { deviceRouter } from "./routes/devices";
import { healthRouter } from "./routes/health";
import { departmentRouter } from "./routes/departments";
import { masterUserRouter } from "./routes/master-users";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/img", express.static(path.resolve(process.cwd(), "img")));

app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", requireAuth, deviceRouter);
app.use("/api", requireAuth, deviceRecordRouter);
app.use("/api", requireAuth, departmentRouter);
app.use("/api", requireAuth, masterUserRouter);

app.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown server error";
  res.status(500).json({ message });
});

export default app;
