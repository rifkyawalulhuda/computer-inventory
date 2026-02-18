import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma";

export const deviceRecordRouter = Router();

type DeviceRecordPayload = {
  no: number | null;
  jobCodeId: number;
  picUserId: string;
  userName: string | null;
  userEmail: string | null;
  serialNo: string | null;
  category: string | null;
  model: string | null;
  hostName: string | null;
  status: string | null;
  location: string | null;
  ipList: string | null;
  startDate: Date | null;
  endDate: Date | null;
  daysLease: number | null;
  leaseStatus: string | null;
  hystoryLog: string | null;
  keterangan: string | null;
  bitlockerKey: string | null;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

function normalizeStatus(value: unknown): string | null {
  const text = cleanText(value).toUpperCase();
  if (!text) {
    return null;
  }

  if (text !== "ON" && text !== "OFF" && text !== "EXPIRED") {
    throw new Error('Status harus "ON" atau "OFF".');
  }

  return text;
}

function normalizeIpList(value: unknown): string | null {
  const text = toNullableText(value);
  if (!text) {
    return null;
  }

  if (text.length > 20) {
    throw new Error("IP List maksimal 20 karakter.");
  }

  if (/[A-Za-z]/.test(text)) {
    throw new Error("IP List hanya boleh angka dan simbol.");
  }

  return text;
}

function parseDate(value: unknown, label: string): Date | null {
  const text = cleanText(value);
  if (!text) {
    return null;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} tidak valid.`);
  }

  return date;
}

function parseInteger(
  value: unknown,
  label: string,
  options?: { min?: number },
): number | null {
  const text = cleanText(value);
  if (!text) {
    return null;
  }

  const num = Number(text);
  if (!Number.isInteger(num)) {
    throw new Error(`${label} harus angka bulat valid.`);
  }

  if (typeof options?.min === "number" && num < options.min) {
    throw new Error(`${label} harus angka valid.`);
  }

  return num;
}
function getUtcDateStartMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function calculateDaysLease(startDate: Date | null, endDate: Date | null): number | null {
  if (!startDate || !endDate) {
    return null;
  }

  const startMs = getUtcDateStartMs(startDate);
  const endMs = getUtcDateStartMs(endDate);

  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const baseMs = Math.max(startMs, todayMs);

  if (baseMs > endMs) {
    return 0;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((endMs - baseMs) / msPerDay);
}
function parsePayload(payload: unknown): DeviceRecordPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload tidak valid.");
  }

  const body = payload as Record<string, unknown>;

  const no = parseInteger(body.no, "NO", { min: 0 });
  const jobCodeId = Number(body.jobCodeId);
  const picUserId = cleanText(body.picUserId);
  const userName = toNullableText(body.userName);
  const userEmail = toNullableText(body.userEmail);
  const serialNo = toNullableText(body.serialNo);
  const category = toNullableText(body.category);
  const model = toNullableText(body.model);
  const hostName = toNullableText(body.hostName);
  const requestedStatus = normalizeStatus(body.status);
  const location = toNullableText(body.location);
  const ipList = normalizeIpList(body.ipList);
  const startDate = parseDate(body.startDate, "Start Date");
  const endDate = parseDate(body.endDate, "End Date");
  const daysLease = calculateDaysLease(startDate, endDate);
  if (requestedStatus === "EXPIRED" && !(daysLease !== null && daysLease <= 0)) {
    throw new Error('Status "EXPIRED" hanya boleh otomatis saat Days Lease 0 atau kurang.');
  }

  const status = daysLease !== null && daysLease <= 0 ? "EXPIRED" : requestedStatus;
  const leaseStatus = toNullableText(body.leaseStatus);
  const hystoryLog = toNullableText(body.hystoryLog);
  const keterangan = toNullableText(body.keterangan);
  const bitlockerKey = toNullableText(body.bitlockerKey);

  if (!Number.isInteger(jobCodeId) || jobCodeId < 1) {
    throw new Error("Job Code wajib dipilih.");
  }

  if (!picUserId) {
    throw new Error("PIC Name wajib dipilih.");
  }

  if (userEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    throw new Error("User Email tidak valid.");
  }

  if (startDate && endDate && startDate > endDate) {
    throw new Error("Start Date tidak boleh lebih besar dari End Date.");
  }

  return {
    no,
    jobCodeId,
    picUserId,
    userName,
    userEmail,
    serialNo,
    category,
    model,
    hostName,
    status,
    location,
    ipList,
    startDate,
    endDate,
    daysLease,
    leaseStatus,
    hystoryLog,
    keterangan,
    bitlockerKey,
  };
}

function formatDate(date: Date | null | undefined): string {
  if (!date) {
    return "";
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function splitIpList(ipList: string | null): string[] {
  if (!ipList) {
    return [];
  }

  return [...new Set(ipList.split(/[\n,;]+/).map((v) => v.trim()).filter(Boolean))];
}

function mapDeviceToExcelRecord(row: {
  id: string;
  legacyNo: number | null;
  serialNumber: string | null;
  hostName: string | null;
  userNameRaw: string | null;
  userEmailRaw: string | null;
  statusRaw: string | null;
  locationRaw: string | null;
  ipListRaw: string | null;
  picNameRaw: string | null;
  notes: string | null;
  bitlockerKey: string | null;
  jobCode: { id: number; code: string } | null;
  category: { name: string } | null;
  model: { name: string } | null;
  leaseContracts: Array<{
    startDate: Date | null;
    endDate: Date | null;
    daysLease: number | null;
    leaseStatus: string | null;
    historyLog: string | null;
  }>;
}) {
  const latestLease = row.leaseContracts[0] ?? null;

  return {
    id: row.id,
    NO: row.legacyNo ?? "",
    "Job Code": row.jobCode?.code ?? "",
    "PIC Name": row.picNameRaw ?? "",
    "Serial No.": row.serialNumber ?? "",
    Category: row.category?.name ?? "",
    Model: row.model?.name ?? "",
    "Host Name": row.hostName ?? "",
    "User Name": row.userNameRaw ?? "",
    "User Email": row.userEmailRaw ?? "",
    Status: row.statusRaw ?? "",
    Location: row.locationRaw ?? "",
    "IP List": row.ipListRaw ?? "",
    "Start Date": formatDate(latestLease?.startDate),
    "End Date": formatDate(latestLease?.endDate),
    "Days Lease": latestLease?.daysLease ?? "",
    "Lease Status": latestLease?.leaseStatus ?? "",
    "Hystory Log": latestLease?.historyLog ?? "",
    Keterangan: row.notes ?? "",
    "Bitlocker Key": row.bitlockerKey ?? "",
  };
}

deviceRecordRouter.get("/device-records", async (_req, res, next) => {
  try {
    const rows = await prisma.device.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        jobCode: { select: { id: true, code: true } },
        category: { select: { name: true } },
        model: { select: { name: true } },
        leaseContracts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            startDate: true,
            endDate: true,
            daysLease: true,
            leaseStatus: true,
            historyLog: true,
          },
        },
      },
    });

    res.json({ data: rows.map(mapDeviceToExcelRecord) });
  } catch (error) {
    next(error);
  }
});

deviceRecordRouter.post("/device-records", async (req, res, next) => {
  try {
    const payload = parsePayload(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const jobCode = await tx.jobCode.findUnique({ where: { id: payload.jobCodeId } });
      if (!jobCode) {
        throw new Error("Job Code tidak ditemukan.");
      }

      const picUser = await tx.masterUser.findUnique({ where: { id: payload.picUserId } });
      if (!picUser) {
        throw new Error("PIC Name tidak ditemukan.");
      }

      if (picUser.jobCodeId !== payload.jobCodeId) {
        throw new Error("PIC Name tidak sesuai dengan Job Code yang dipilih.");
      }

      let categoryId: number | null = null;
      if (payload.category) {
        const category = await tx.deviceCategory.upsert({
          where: { name: payload.category },
          update: {},
          create: { name: payload.category },
        });
        categoryId = category.id;
      }

      let modelId: number | null = null;
      if (payload.model) {
        const model = await tx.deviceModel.upsert({
          where: { name: payload.model },
          update: {},
          create: { name: payload.model },
        });
        modelId = model.id;
      }

      let locationId: number | null = null;
      if (payload.location) {
        const location = await tx.location.upsert({
          where: { name: payload.location },
          update: {},
          create: { name: payload.location },
        });
        locationId = location.id;
      }

      const nextLegacyNo =
        payload.no ??
        (((await tx.device.aggregate({ _max: { legacyNo: true } }))._max.legacyNo ?? 0) +
          1);

      const device = await tx.device.create({
        data: {
          legacyNo: nextLegacyNo,
          serialNumber: payload.serialNo,
          hostName: payload.hostName,
          userNameRaw: payload.userName,
          userEmailRaw: payload.userEmail,
          statusRaw: payload.status,
          locationRaw: payload.location,
          ipListRaw: payload.ipList,
          picNameRaw: picUser.name,
          notes: payload.keterangan,
          bitlockerKey: payload.bitlockerKey,
          jobCodeId: payload.jobCodeId,
          categoryId,
          modelId,
          locationId,
        },
      });

      const ipAddresses = splitIpList(payload.ipList);
      if (ipAddresses.length > 0) {
        await tx.deviceIp.createMany({
          data: ipAddresses.map((ipAddress) => ({
            deviceId: device.id,
            ipAddress,
          })),
          skipDuplicates: true,
        });
      }

      const shouldCreateLease =
        payload.startDate ||
        payload.endDate ||
        payload.daysLease !== null ||
        payload.leaseStatus ||
        payload.hystoryLog;

      if (shouldCreateLease) {
        await tx.leaseContract.create({
          data: {
            deviceId: device.id,
            startDate: payload.startDate,
            endDate: payload.endDate,
            daysLease: payload.daysLease,
            leaseStatus: payload.leaseStatus,
            historyLog: payload.hystoryLog,
          },
        });
      }

      return tx.device.findUniqueOrThrow({
        where: { id: device.id },
        include: {
          jobCode: { select: { id: true, code: true } },
          category: { select: { name: true } },
          model: { select: { name: true } },
          leaseContracts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              startDate: true,
              endDate: true,
              daysLease: true,
              leaseStatus: true,
              historyLog: true,
            },
          },
        },
      });
    });

    res.status(201).json({ data: mapDeviceToExcelRecord(created) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Serial No. sudah terdaftar." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});







