import { Prisma } from "@prisma/client";
import multer from "multer";
import { type Request, type Response, Router } from "express";
import XLSX from "xlsx";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/auth";

export const deviceRecordRouter = Router();

type DeviceRecordPayload = {
  no: number | null;
  jobCodeId: number;
  departmentJobCodeId: number | null;
  picUserId: string;
  userName: string | null;
  userEmail: string | null;
  serialNo: string | null;
  category: string | null;
  model: string | null;
  hostName: string | null;
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

type DeviceExportPayload = {
  ids?: unknown;
};

type DeviceImportFileRow = {
  rowNumber: number;
  jobCode: string;
  departmentJobCode: string;
  picName: string;
  serialNo: string;
  category: string;
  model: string;
  hostName: string;
  userName: string;
  userEmail: string;
  location: string;
  ipList: string;
  startDate: string;
  endDate: string;
  leaseStatus: string;
  keterangan: string;
  bitlockerKey: string;
};

type PreparedImportRow = {
  rowNumber: number;
  payload: DeviceRecordPayload;
};

type HistoryFieldChange = {
  label: string;
  before: string | number | null | undefined;
  after: string | number | null | undefined;
};

type EditorRole = "admin" | "user";

const DEVICE_IMPORT_TEMPLATE_HEADERS = [
  "Department",
  "Job Code",
  "PIC Name",
  "Serial No.",
  "Category",
  "Model",
  "Host Name",
  "User Name",
  "User Email",
  "Location",
  "IP List",
  "Start Date",
  "End Date",
  "Lease Status",
  "Keterangan",
  "Bitlocker Key",
] as const;

const MAX_DEVICE_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
const DEVICE_IMPORT_DROPDOWN_MAX_ROWS = 1000;
const LEGACY_NO_LOCK_KEY = 8042026;

const deviceImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DEVICE_IMPORT_FILE_SIZE,
  },
  fileFilter: (_req, file, callback) => {
    const filename = String(file.originalname || "").toLowerCase();
    const isExcelFile = filename.endsWith(".xlsx") || filename.endsWith(".xls");

    if (!isExcelFile) {
      callback(new Error("Format file harus .xlsx atau .xls."));
      return;
    }

    callback(null, true);
  },
});

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
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

  const no = null;
  const jobCodeId = Number(body.jobCodeId);
  const parsedDepartmentJobCodeId = parseInteger(body.departmentJobCodeId, "Job Code", { min: 1 });
  const picUserId = cleanText(body.picUserId);
  const userName = toNullableText(body.userName);
  const userEmail = toNullableText(body.userEmail);
  const serialNo = toNullableText(body.serialNo);
  const category = toNullableText(body.category);
  const model = toNullableText(body.model);
  const hostName = toNullableText(body.hostName);
  const location = toNullableText(body.location);
  const ipList = normalizeIpList(body.ipList);
  const startDate = parseDate(body.startDate, "Start Date");
  const endDate = parseDate(body.endDate, "End Date");
  const daysLease = calculateDaysLease(startDate, endDate);
  const leaseStatus = toNullableText(body.leaseStatus);
  const hystoryLog = toNullableText(body.hystoryLog);
  const keterangan = toNullableText(body.keterangan);
  const bitlockerKey = toNullableText(body.bitlockerKey);

  if (!Number.isInteger(jobCodeId) || jobCodeId < 1) {
    throw new Error("Department wajib dipilih.");
  }

  if (parsedDepartmentJobCodeId !== null && (!Number.isInteger(parsedDepartmentJobCodeId) || parsedDepartmentJobCodeId < 1)) {
    throw new Error("Job Code tidak valid.");
  }

  const departmentJobCodeId: number | null = parsedDepartmentJobCodeId;

  if (!picUserId) {
    throw new Error("PIC Name wajib dipilih.");
  }

  if (!serialNo) {
    throw new Error("Serial No. wajib diisi.");
  }

  if (!category) {
    throw new Error("Category wajib diisi.");
  }

  if (!model) {
    throw new Error("Model wajib diisi.");
  }

  if (!hostName) {
    throw new Error("Host Name wajib diisi.");
  }

  if (!startDate) {
    throw new Error("Start Date wajib diisi.");
  }

  if (!endDate) {
    throw new Error("End Date wajib diisi.");
  }

  if (!leaseStatus) {
    throw new Error("Lease Status wajib dipilih.");
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
    departmentJobCodeId,
    picUserId,
    userName,
    userEmail,
    serialNo,
    category,
    model,
    hostName,
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

async function lockLegacyNoSequence(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(" + LEGACY_NO_LOCK_KEY + ")");
}

async function getNextLegacyNo(tx: Prisma.TransactionClient): Promise<number> {
  const maxLegacyNo = (await tx.device.aggregate({ _max: { legacyNo: true } }))._max.legacyNo ?? 0;
  return maxLegacyNo + 1;
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

function normalizeComparableValue(value: string | number | null | undefined): string {
  return String(value ?? "").trim();
}

function toHistoryDisplayValue(value: string | number | null | undefined): string {
  const text = normalizeComparableValue(value);
  return text || "-";
}

function formatHistoryTimestamp(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function buildHistoryEntry(message: string): string {
  return `[${formatHistoryTimestamp()}] ${message}`;
}

function appendHistoryEntries(
  existingHistory: string | null | undefined,
  entries: string[],
): string | null {
  const base = toNullableText(existingHistory);
  const cleanEntries = entries.map((entry) => cleanText(entry)).filter(Boolean);
  if (!cleanEntries.length) {
    return base;
  }

  return base ? `${base}\n${cleanEntries.join("\n")}` : cleanEntries.join("\n");
}

function toCompactHistoryValue(value: string | number | null | undefined): string {
  const text = toHistoryDisplayValue(value);
  const maxLength = 28;
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function getChangedFieldMessages(changes: HistoryFieldChange[]): string[] {
  return changes
    .filter(
      ({ before, after }) =>
        normalizeComparableValue(before) !== normalizeComparableValue(after),
    )
    .map(
      ({ label, before, after }) =>
        `${label}:${toCompactHistoryValue(before)}->${toCompactHistoryValue(after)}`,
    );
}

function getChangedFieldLabels(changes: HistoryFieldChange[]): string[] {
  return changes
    .filter(
      ({ before, after }) =>
        normalizeComparableValue(before) !== normalizeComparableValue(after),
    )
    .map(({ label }) => label);
}

function parseEditorRole(req: Request): EditorRole {
  if (req.authUser?.role === "admin" || req.authUser?.role === "user") {
    return req.authUser.role;
  }

  const body = req.body as Record<string, unknown> | null | undefined;
  const rawRole = cleanText(req.header("x-user-role") ?? body?.editorRole).toLowerCase();
  return rawRole === "user" ? "user" : "admin";
}

function getHistoryActorName(req: Request, fallbackName?: string): string {
  const authName = cleanText(req.authUser?.name);
  if (authName) {
    return authName;
  }

  const fallback = cleanText(fallbackName);
  return fallback || "Unknown";
}

async function getAssignedJobCodeId(req: Request): Promise<number | null> {
  const authUserId = cleanText(req.authUser?.id);
  if (!authUserId) {
    return null;
  }

  const user = await prisma.masterUser.findUnique({
    where: { id: authUserId },
    select: { jobCodeId: true },
  });

  if (!user || !Number.isInteger(user.jobCodeId) || user.jobCodeId < 1) {
    return null;
  }

  return user.jobCodeId;
}

async function resolveDataScope(req: Request): Promise<{ editorRole: EditorRole; userJobCodeId: number | null }> {
  const editorRole = parseEditorRole(req);
  if (editorRole === "admin") {
    return { editorRole, userJobCodeId: null };
  }

  const userJobCodeId = await getAssignedJobCodeId(req);
  if (!userJobCodeId) {
    throw new Error("ROLE_USER_JOB_CODE_NOT_FOUND");
  }

  return { editorRole, userJobCodeId };
}

function splitIpList(ipList: string | null): string[] {
  if (!ipList) {
    return [];
  }

  return [...new Set(ipList.split(/[\n,;]+/).map((v) => v.trim()).filter(Boolean))];
}

const latestLeaseSelect = {
  id: true,
  startDate: true,
  endDate: true,
  daysLease: true,
  leaseStatus: true,
  historyLog: true,
} as const;

const deviceRecordInclude = {
  jobCode: { select: { id: true, code: true } },
  departmentJobCode: { select: { id: true, code: true } },
  category: { select: { name: true } },
  model: { select: { name: true } },
  leaseContracts: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: latestLeaseSelect,
  },
} as const;

type MappedDeviceRow = {
  id: string;
  legacyNo: number | null;
  serialNumber: string | null;
  hostName: string | null;
  userNameRaw: string | null;
  userEmailRaw: string | null;
  locationRaw: string | null;
  ipListRaw: string | null;
  picNameRaw: string | null;
  notes: string | null;
  bitlockerKey: string | null;
  jobCode: { id: number; code: string } | null;
  departmentJobCode: { id: number; code: string } | null;
  category: { name: string } | null;
  model: { name: string } | null;
  leaseContracts: Array<{
    id: string;
    startDate: Date | null;
    endDate: Date | null;
    daysLease: number | null;
    leaseStatus: string | null;
    historyLog: string | null;
  }>;
};

function mapDeviceToExcelRecord(row: MappedDeviceRow, fallbackNo?: number) {
  const latestLease = row.leaseContracts[0] ?? null;
  const calculatedDaysLease = calculateDaysLease(
    latestLease?.startDate ?? null,
    latestLease?.endDate ?? null,
  );
  const displayDaysLease = calculatedDaysLease ?? latestLease?.daysLease ?? "";

  return {
    id: row.id,
    NO: row.legacyNo ?? fallbackNo ?? "",
    "Department": row.jobCode?.code ?? "",
    "Job Code": row.departmentJobCode?.code ?? "",
    "PIC Name": row.picNameRaw ?? "",
    "Serial No.": row.serialNumber ?? "",
    Category: row.category?.name ?? "",
    Model: row.model?.name ?? "",
    "Host Name": row.hostName ?? "",
    "User Name": row.userNameRaw ?? "",
    "User Email": row.userEmailRaw ?? "",
    Location: row.locationRaw ?? "",
    "IP List": row.ipListRaw ?? "",
    "Start Date": formatDate(latestLease?.startDate),
    "End Date": formatDate(latestLease?.endDate),
    "Days Lease": displayDaysLease,
    "Lease Status": latestLease?.leaseStatus ?? "",
    "Hystory Log": latestLease?.historyLog ?? "",
    Keterangan: row.notes ?? "",
    "Bitlocker Key": row.bitlockerKey ?? "",
  };
}

function mapDevicesWithResolvedNo(rows: MappedDeviceRow[]) {
  let nextFallbackNo = rows.reduce((maxNo, row) => {
    const value = typeof row.legacyNo === "number" && Number.isFinite(row.legacyNo) ? row.legacyNo : 0;
    return value > maxNo ? value : maxNo;
  }, 0);

  return rows.map((row) => {
    if (typeof row.legacyNo === "number" && Number.isFinite(row.legacyNo) && row.legacyNo > 0) {
      return mapDeviceToExcelRecord(row);
    }

    nextFallbackNo += 1;
    return mapDeviceToExcelRecord(row, nextFallbackNo);
  });
}

const deviceExportColumns = [
  "NO",
  "Department",
  "Job Code",
  "PIC Name",
  "Serial No.",
  "Category",
  "Model",
  "Host Name",
  "User Name",
  "User Email",
  "Days Lease",
  "Lease Status",
  "Location",
  "IP List",
  "Start Date",
  "End Date",
  "Hystory Log",
  "Keterangan",
  "Bitlocker Key",
] as const;

type DeviceExcelRecord = ReturnType<typeof mapDeviceToExcelRecord>;
type DeviceExportRow = Record<(typeof deviceExportColumns)[number], string | number>;

function toExportRow(row: DeviceExcelRecord): DeviceExportRow {
  return {
    NO: row["NO"],
    "Department": row["Department"],
    "Job Code": row["Job Code"],
    "PIC Name": row["PIC Name"],
    "Serial No.": row["Serial No."],
    Category: row.Category,
    Model: row.Model,
    "Host Name": row["Host Name"],
    "User Name": row["User Name"],
    "User Email": row["User Email"],
    "Days Lease": row["Days Lease"],
    "Lease Status": row["Lease Status"],
    Location: row.Location,
    "IP List": row["IP List"],
    "Start Date": row["Start Date"],
    "End Date": row["End Date"],
    "Hystory Log": row["Hystory Log"],
    Keterangan: row.Keterangan,
    "Bitlocker Key": row["Bitlocker Key"],
  };
}

function parseExportRequestIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const { ids } = payload as DeviceExportPayload;
  if (ids === undefined || ids === null) {
    return [];
  }

  if (!Array.isArray(ids)) {
    throw new Error("Format export tidak valid. Field ids harus berupa array.");
  }

  if (ids.length > 5000) {
    throw new Error("Maksimal 5000 data per export.");
  }

  const normalized = ids
    .map((value) => cleanText(value))
    .filter(Boolean);

  return [...new Set(normalized)];
}

function formatExportTimestamp(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function reorderRowsByRequestedIds(rows: DeviceExcelRecord[], requestedIds: string[]): DeviceExcelRecord[] {
  if (requestedIds.length === 0) {
    return rows;
  }

  const orderMap = new Map(requestedIds.map((id, index) => [id, index]));
  return rows
    .filter((row) => orderMap.has(row.id))
    .sort((left, right) => {
      const leftOrder = orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function normalizeImportHeaderText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function ensureDeviceImportTemplateHeader(headerRow: unknown[]): void {
  const expected = DEVICE_IMPORT_TEMPLATE_HEADERS.map((header) => normalizeImportHeaderText(header));
  const actual = headerRow
    .slice(0, DEVICE_IMPORT_TEMPLATE_HEADERS.length)
    .map((header) => normalizeImportHeaderText(header));

  const isMatch = expected.every((header, index) => header === actual[index]);
  if (!isMatch) {
    throw new Error(
      `Header template tidak sesuai. Gunakan urutan: ${DEVICE_IMPORT_TEMPLATE_HEADERS.join(", ")}`,
    );
  }
}

function formatDateParts(year: number, month: number, day: number): string {
  const safeYear = String(year).padStart(4, "0");
  const safeMonth = String(month).padStart(2, "0");
  const safeDay = String(day).padStart(2, "0");
  return `${safeYear}-${safeMonth}-${safeDay}`;
}

function normalizeImportDateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "";
    }

    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsedDate = XLSX.SSF.parse_date_code(value);
    if (!parsedDate || !parsedDate.y || !parsedDate.m || !parsedDate.d) {
      return "";
    }

    return formatDateParts(parsedDate.y, parsedDate.m, parsedDate.d);
  }

  const text = cleanText(value);
  if (!text) {
    return "";
  }

  const yyyyMmDdMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMmDdMatch) {
    return text;
  }

  const slashOrDashMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slashOrDashMatch) {
    const day = Number(slashOrDashMatch[1]);
    const month = Number(slashOrDashMatch[2]);
    const year = Number(slashOrDashMatch[3]);

    if (
      Number.isInteger(day)
      && Number.isInteger(month)
      && Number.isInteger(year)
      && day >= 1
      && day <= 31
      && month >= 1
      && month <= 12
      && year >= 1900
    ) {
      return formatDateParts(year, month, day);
    }
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return formatDate(date);
}

function normalizeImportLeaseStatus(value: unknown): string {
  const text = cleanText(value);
  if (!text) {
    return "";
  }

  const normalizedUpper = text.toUpperCase();
  if (normalizedUpper === "ACTIVE") {
    return "ACTIVE";
  }

  if (normalizedUpper === "EXPIRED") {
    return "EXPIRED";
  }

  if (normalizedUpper === "BACK TO KDDI" || normalizedUpper === "BACK_TO_KDDI") {
    return "Back To KDDI";
  }

  throw new Error('Lease Status hanya boleh "ACTIVE", "EXPIRED", atau "Back To KDDI".');
}

function parseDeviceImportRows(sheet: XLSX.WorkSheet): DeviceImportFileRow[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  if (!rows.length) {
    throw new Error("File Excel kosong.");
  }

  const [firstRow, ...dataRows] = rows;
  const headerRow = Array.isArray(firstRow) ? firstRow : [];
  ensureDeviceImportTemplateHeader(headerRow);

  const parsedRows: DeviceImportFileRow[] = [];

  dataRows.forEach((rawRow, index) => {
    if (!Array.isArray(rawRow)) {
      return;
    }

    const rowNumber = index + 2;
    const values = Array.from({ length: DEVICE_IMPORT_TEMPLATE_HEADERS.length }, (_value, idx) => rawRow[idx]);
    const isEmptyRow = values.every((value) => cleanText(value) === "");

    if (isEmptyRow) {
      return;
    }

    parsedRows.push({
      rowNumber,
      jobCode: cleanText(values[0]).toUpperCase(),
      departmentJobCode: cleanText(values[1]).toUpperCase(),
      picName: cleanText(values[2]),
      serialNo: cleanText(values[3]),
      category: cleanText(values[4]),
      model: cleanText(values[5]),
      hostName: cleanText(values[6]),
      userName: cleanText(values[7]),
      userEmail: cleanText(values[8]),
      location: cleanText(values[9]),
      ipList: cleanText(values[10]),
      startDate: normalizeImportDateValue(values[11]),
      endDate: normalizeImportDateValue(values[12]),
      leaseStatus: cleanText(values[13]),
      keterangan: cleanText(values[14]),
      bitlockerKey: cleanText(values[15]),
    });
  });

  if (!parsedRows.length) {
    throw new Error("Tidak ada data yang bisa diimport.");
  }

  return parsedRows;
}

async function createDeviceImportTemplateWorkbookBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const templateSheet = workbook.addWorksheet("Template");
  const instructionSheet = workbook.addWorksheet("Instruksi");
  const referenceSheet = workbook.addWorksheet("Referensi");

  const [departments, picUsers] = await Promise.all([
    prisma.department.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true,
        jobCodes: {
          orderBy: { code: "asc" },
          select: {
            code: true,
          },
        },
      },
    }),
    prisma.masterUser.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        name: true,
        email: true,
      },
    }),
  ]);

  templateSheet.addRow([...DEVICE_IMPORT_TEMPLATE_HEADERS]);
  templateSheet.addRow([
    departments[0]?.code ?? "",
    departments[0]?.jobCodes?.[0]?.code ?? "",
    picUsers[0] ? `${picUsers[0].name} (${picUsers[0].email})` : "",
    "SN-001",
    "Laptop",
    "DELL 5420",
    "L-ID-22-030",
    "Kipli",
    "rifki@sankyu.co.id",
    "Cikarang",
    "192.168.1.10",
    "2026-02-01",
    "2026-12-31",
    "ACTIVE",
    "Data awal",
    "",
  ]);

  templateSheet.columns = [
    { width: 12 },
    { width: 16 },
    { width: 30 },
    { width: 18 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 28 },
    { width: 18 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 24 },
    { width: 24 },
  ];

  const headerRow = templateSheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  referenceSheet.columns = [
    { width: 28 },
    { width: 24 },
    { width: 42 },
    { width: 16 },
    { width: 16 },
  ];

  referenceSheet.getCell("A1").value = "Department";
  referenceSheet.getCell("B1").value = "Job Code";
  referenceSheet.getCell("C1").value = "PIC Name";
  referenceSheet.getCell("D1").value = "Category";
  referenceSheet.getCell("E1").value = "Lease Status";

  const categoryOptions = ["Laptop", "Desktop"];
  const leaseStatusOptions = ["ACTIVE", "EXPIRED", "Back To KDDI"];

  const jobCodeValues = departments.length > 0 ? departments.map((row) => row.code) : [""];
  const departmentJobCodeValues = departments.length > 0
    ? [...new Set(departments.flatMap((row) => row.jobCodes.map((item) => item.code)))]
    : [""];
  const picValues = picUsers.length > 0
    ? picUsers.map((user) => `${user.name} (${user.email})`)
    : [""];

  const fillColumn = (column: "A" | "B" | "C" | "D" | "E", values: string[]) => {
    values.forEach((value, index) => {
      referenceSheet.getCell(`${column}${index + 2}`).value = value;
    });
  };

  fillColumn("A", jobCodeValues);
  fillColumn("B", departmentJobCodeValues);
  fillColumn("C", picValues);
  fillColumn("D", categoryOptions);
  fillColumn("E", leaseStatusOptions);

  const addListValidation = (
    column: number,
    formula: string,
    allowBlank = true,
    errorMessage = "Pilih nilai dari dropdown.",
  ) => {
    for (let row = 2; row <= DEVICE_IMPORT_DROPDOWN_MAX_ROWS; row += 1) {
      templateSheet.getCell(row, column).dataValidation = {
        type: "list",
        allowBlank,
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: "error",
        errorTitle: "Pilihan tidak valid",
        error: errorMessage,
      };
    }
  };

  const jobCodeLastRow = Math.max(2, jobCodeValues.length + 1);
  const departmentJobCodeLastRow = Math.max(2, departmentJobCodeValues.length + 1);
  const picLastRow = Math.max(2, picValues.length + 1);

  addListValidation(1, `=Referensi!$A$2:$A$${jobCodeLastRow}`, false, "Department wajib dipilih dari dropdown.");
  addListValidation(2, `=Referensi!$B$2:$B$${departmentJobCodeLastRow}`, false, "Job Code wajib dipilih dari dropdown.");
  addListValidation(3, `=Referensi!$C$2:$C$${picLastRow}`, false, "PIC Name wajib dipilih dari dropdown.");
  addListValidation(5, "=Referensi!$D$2:$D$3");
  addListValidation(14, "=Referensi!$E$2:$E$4");

  for (let row = 2; row <= DEVICE_IMPORT_DROPDOWN_MAX_ROWS; row += 1) {
    templateSheet.getCell(row, 12).dataValidation = {
      type: "date",
      operator: "greaterThanOrEqual",
      allowBlank: true,
      formulae: ["DATE(1900,1,1)"],
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle: "Tanggal tidak valid",
      error: "Gunakan format tanggal yang valid (YYYY-MM-DD).",
    };

    templateSheet.getCell(row, 13).dataValidation = {
      type: "date",
      operator: "greaterThanOrEqual",
      allowBlank: true,
      formulae: ["DATE(1900,1,1)"],
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle: "Tanggal tidak valid",
      error: "Gunakan format tanggal yang valid (YYYY-MM-DD).",
    };
  }

  instructionSheet.addRows([
    ["Panduan Import Data Perangkat"],
    ["1. Isi data mulai baris ke-2 di sheet Template."],
    ["2. Kolom NO tidak perlu diisi karena otomatis generate oleh sistem."],
    ["3. Kolom dropdown: Department, Job Code, PIC Name, Category, Lease Status."],
    ["4. Department dan Job Code harus terdaftar di master Department."],
    ["5. Job Code harus sesuai dengan Department pada baris yang sama."],
    ["6. PIC Name harus user yang terdaftar di Master User."],
    ["7. Format tanggal yang disarankan: YYYY-MM-DD (contoh 2026-02-28)."],
    ["8. Lease Status: ACTIVE, EXPIRED, atau Back To KDDI."],
    ["9. Jika Serial No sudah ada, data akan diupdate. Jika belum ada, data baru dibuat."],
  ]);
  instructionSheet.getColumn(1).width = 120;
  instructionSheet.getRow(1).font = { bold: true };

  referenceSheet.state = "veryHidden";

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
function runDeviceImportUpload(req: Request, res: Response): Promise<void> {
  const uploadMiddleware = deviceImportUpload.single("file");

  return new Promise((resolve, reject) => {
    uploadMiddleware(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function resolvePicUserFromImport(
  users: Array<{ id: string; name: string; email: string }>,
  picReference: string,
): { id: string; name: string; email: string } {
  const target = cleanText(picReference).toLowerCase();
  if (!target) {
    throw new Error("PIC Name wajib diisi.");
  }

  const idReference = cleanText(picReference);
  const byId = users.find((user) => cleanText(user.id) === idReference);
  if (byId) {
    return byId;
  }

  const byEmail = users.find((user) => cleanText(user.email).toLowerCase() === target);
  if (byEmail) {
    return byEmail;
  }

  const emailInsideParentheses = target.match(/\(([^()\s]+@[^()\s]+)\)\s*$/);
  if (emailInsideParentheses && emailInsideParentheses[1]) {
    const emailText = emailInsideParentheses[1].toLowerCase();
    const byEmailFromDisplay = users.find((user) => cleanText(user.email).toLowerCase() === emailText);
    if (byEmailFromDisplay) {
      return byEmailFromDisplay;
    }
  }

  const plainTargetName = target.replace(/\s+\(.+\)$/g, "").trim();
  const byName = users.filter((user) => cleanText(user.name).toLowerCase() === plainTargetName);
  if (byName.length === 1) {
    return byName[0];
  }

  if (byName.length > 1) {
    throw new Error("PIC Name duplikat pada Department ini. Gunakan email PIC agar spesifik.");
  }

  throw new Error("PIC Name tidak ditemukan untuk Department ini.");
}

async function prepareDeviceImportRows(rows: DeviceImportFileRow[]): Promise<PreparedImportRow[]> {
  const uniqueDepartments = [...new Set(rows.map((row) => cleanText(row.jobCode).toUpperCase()).filter(Boolean))];

  const departments = await prisma.department.findMany({
    where: {
      code: {
        in: uniqueDepartments,
      },
    },
    select: {
      id: true,
      code: true,
      jobCodes: {
        select: {
          id: true,
          code: true,
        },
      },
    },
  });

  const departmentByCode = new Map(departments.map((row) => [cleanText(row.code).toUpperCase(), row]));

  const users = await prisma.masterUser.findMany({
    where: {
      jobCodeId: {
        in: departments.map((row) => row.id),
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      jobCodeId: true,
    },
  });

  const usersByJobCode = new Map<number, Array<{ id: string; name: string; email: string }>>();
  users.forEach((user) => {
    const list = usersByJobCode.get(user.jobCodeId) || [];
    list.push({ id: user.id, name: user.name, email: user.email });
    usersByJobCode.set(user.jobCodeId, list);
  });

  const preparedRows: PreparedImportRow[] = [];
  const rowErrors: string[] = [];
  const seenSerialNo = new Set<string>();

  rows.forEach((row) => {
    try {
      const jobCodeText = cleanText(row.jobCode).toUpperCase();
      if (!jobCodeText) {
        throw new Error("Department wajib diisi.");
      }

      const department = departmentByCode.get(jobCodeText);
      if (!department) {
        throw new Error(`Department "${jobCodeText}" tidak ditemukan di master.`);
      }

      const departmentJobCodeText = cleanText(row.departmentJobCode).toUpperCase();
      if (!departmentJobCodeText) {
        throw new Error("Job Code wajib diisi.");
      }

      const selectedDepartmentJobCode = department.jobCodes.find(
        (item) => cleanText(item.code).toUpperCase() === departmentJobCodeText,
      );
      if (!selectedDepartmentJobCode) {
        throw new Error(`Job Code "${departmentJobCodeText}" tidak sesuai dengan Department "${jobCodeText}".`);
      }

      const serialNo = cleanText(row.serialNo);
      if (serialNo) {
        const serialKey = serialNo.toUpperCase();
        if (seenSerialNo.has(serialKey)) {
          throw new Error(`Serial No. "${serialNo}" duplikat di file import.`);
        }

        seenSerialNo.add(serialKey);
      }

      const jobCodeUsers = usersByJobCode.get(department.id) || [];
      const picUser = resolvePicUserFromImport(jobCodeUsers, row.picName);

      const payload = parsePayload({
        jobCodeId: department.id,
        departmentJobCodeId: selectedDepartmentJobCode.id,
        picUserId: picUser.id,
        userName: row.userName,
        userEmail: row.userEmail,
        serialNo,
        category: row.category,
        model: row.model,
        hostName: row.hostName,
        location: row.location,
        ipList: row.ipList,
        startDate: row.startDate,
        endDate: row.endDate,
        leaseStatus: normalizeImportLeaseStatus(row.leaseStatus),
        hystoryLog: "",
        keterangan: row.keterangan,
        bitlockerKey: row.bitlockerKey,
      });

      preparedRows.push({
        rowNumber: row.rowNumber,
        payload,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Data tidak valid.";
      rowErrors.push(`Baris ${row.rowNumber}: ${message}`);
    }
  });

  if (rowErrors.length > 0) {
    throw new Error(`Validasi import gagal.\n${rowErrors.join("\n")}`);
  }

  if (!preparedRows.length) {
    throw new Error("Tidak ada data valid yang bisa diimport.");
  }

  return preparedRows;
}
async function validateJobAndPic(
  tx: Prisma.TransactionClient,
  payload: DeviceRecordPayload,
): Promise<{
  name: string;
  jobCodeId: number;
  jobCodeCode: string;
  departmentJobCodeId: number | null;
  departmentJobCodeCode: string | null;
}> {
  const jobCode = await tx.department.findUnique({
    where: { id: payload.jobCodeId },
    select: {
      id: true,
      code: true,
      jobCodes: {
        select: {
          id: true,
          code: true,
        },
      },
    },
  });
  if (!jobCode) {
    throw new Error("Department tidak ditemukan.");
  }

  const picUser = await tx.masterUser.findUnique({ where: { id: payload.picUserId } });
  if (!picUser) {
    throw new Error("PIC Name tidak ditemukan.");
  }

  if (picUser.jobCodeId !== payload.jobCodeId) {
    throw new Error("PIC Name tidak sesuai dengan Department yang dipilih.");
  }

  const departmentJobCode = payload.departmentJobCodeId
    ? jobCode.jobCodes.find((item) => item.id === payload.departmentJobCodeId)
    : null;
  if (payload.departmentJobCodeId && !departmentJobCode) {
    throw new Error("Job Code tidak sesuai dengan Department yang dipilih.");
  }

  return {
    name: picUser.name,
    jobCodeId: picUser.jobCodeId,
    jobCodeCode: jobCode.code,
    departmentJobCodeId: departmentJobCode?.id ?? null,
    departmentJobCodeCode: departmentJobCode?.code ?? null,
  };
}

async function resolveLookupIds(tx: Prisma.TransactionClient, payload: DeviceRecordPayload) {
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

  return { categoryId, modelId, locationId };
}

async function syncDeviceIps(
  tx: Prisma.TransactionClient,
  deviceId: string,
  ipList: string | null,
): Promise<void> {
  await tx.deviceIp.deleteMany({ where: { deviceId } });

  const ipAddresses = splitIpList(ipList);
  if (ipAddresses.length === 0) {
    return;
  }

  await tx.deviceIp.createMany({
    data: ipAddresses.map((ipAddress) => ({
      deviceId,
      ipAddress,
    })),
    skipDuplicates: true,
  });
}

async function syncLatestLease(
  tx: Prisma.TransactionClient,
  deviceId: string,
  payload: DeviceRecordPayload,
  latestLeaseId?: string,
): Promise<void> {
  const shouldPersistLease =
    payload.startDate ||
    payload.endDate ||
    payload.daysLease !== null ||
    payload.leaseStatus ||
    payload.hystoryLog;

  const leaseData = {
    startDate: shouldPersistLease ? payload.startDate : null,
    endDate: shouldPersistLease ? payload.endDate : null,
    daysLease: shouldPersistLease ? payload.daysLease : null,
    leaseStatus: shouldPersistLease ? payload.leaseStatus : null,
    historyLog: shouldPersistLease ? payload.hystoryLog : null,
  };

  if (latestLeaseId) {
    await tx.leaseContract.update({
      where: { id: latestLeaseId },
      data: leaseData,
    });
    return;
  }

  if (shouldPersistLease) {
    await tx.leaseContract.create({
      data: {
        deviceId,
        ...leaseData,
      },
    });
  }
}

async function getMappedDeviceById(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.device.findUniqueOrThrow({
    where: { id },
    include: deviceRecordInclude,
  });

  return mapDeviceToExcelRecord(row as unknown as MappedDeviceRow);
}

deviceRecordRouter.get("/device-records", async (req, res, next) => {
  try {
    const scope = await resolveDataScope(req);
    const rows = await prisma.device.findMany({
      where: scope.editorRole === "user" ? { jobCodeId: scope.userJobCodeId ?? undefined } : undefined,
      orderBy: { createdAt: "desc" },
      include: deviceRecordInclude,
    });

    const mappedRows = mapDevicesWithResolvedNo(rows as unknown as MappedDeviceRow[]);
    res.json({ data: mappedRows });
  } catch (error) {
    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    next(error);
  }
});


deviceRecordRouter.get("/device-records/import-template", requireRole("admin"), async (_req, res, next) => {
  try {
    const buffer = await createDeviceImportTemplateWorkbookBuffer();
    const fileName = "template-data-perangkat.xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

deviceRecordRouter.post("/device-records/import", requireRole("admin"), async (req, res, next) => {
  try {
    await runDeviceImportUpload(req, res);

    if (!req.file) {
      return res.status(400).json({ message: "File Excel wajib diupload." });
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: "buffer", raw: true });
    } catch (_error) {
      return res.status(400).json({ message: "File Excel tidak dapat dibaca." });
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return res.status(400).json({ message: "Sheet template tidak ditemukan." });
    }

    const firstSheet = workbook.Sheets[firstSheetName];
    if (!firstSheet) {
      return res.status(400).json({ message: "Sheet template tidak ditemukan." });
    }

    const importRows = parseDeviceImportRows(firstSheet);
    const preparedRows = await prepareDeviceImportRows(importRows);
    const actorName = getHistoryActorName(req);

    let created = 0;
    let updated = 0;

    await prisma.$transaction(async (tx) => {
      await lockLegacyNoSequence(tx);
      let nextLegacyNo = (await tx.device.aggregate({ _max: { legacyNo: true } }))._max.legacyNo ?? 0;

      for (const row of preparedRows) {
        const payload = row.payload;
        const picUser = await validateJobAndPic(tx, payload);
        const { categoryId, modelId, locationId } = await resolveLookupIds(tx, payload);

        const existing = payload.serialNo
          ? await tx.device.findUnique({
            where: { serialNumber: payload.serialNo },
            select: {
              id: true,
              legacyNo: true,
              serialNumber: true,
              hostName: true,
              userNameRaw: true,
              userEmailRaw: true,
              locationRaw: true,
              ipListRaw: true,
              picNameRaw: true,
              notes: true,
              bitlockerKey: true,
              departmentJobCode: {
                select: { code: true },
              },
              jobCode: {
                select: { code: true },
              },
              category: {
                select: { name: true },
              },
              model: {
                select: { name: true },
              },
              leaseContracts: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  startDate: true,
                  endDate: true,
                  leaseStatus: true,
                  historyLog: true,
                },
              },
            },
          })
          : null;

        if (!existing) {
          nextLegacyNo += 1;

          const device = await tx.device.create({
            data: {
              legacyNo: nextLegacyNo,
              serialNumber: payload.serialNo,
              hostName: payload.hostName,
              userNameRaw: payload.userName,
              userEmailRaw: payload.userEmail,
            locationRaw: payload.location,
              ipListRaw: payload.ipList,
              picNameRaw: picUser.name,
              notes: payload.keterangan,
              bitlockerKey: payload.bitlockerKey,
              jobCodeId: payload.jobCodeId,
              departmentJobCodeId: payload.departmentJobCodeId,
              categoryId,
              modelId,
              locationId,
            },
          });

          await syncDeviceIps(tx, device.id, payload.ipList);

          const createdHistoryLog = appendHistoryEntries(payload.hystoryLog, [
            buildHistoryEntry(
              `Data perangkat diimport oleh ${actorName} (baris ${row.rowNumber})${payload.serialNo ? ` (Serial No: ${payload.serialNo})` : ""
              }.`,
            ),
          ]);

          await syncLatestLease(tx, device.id, {
            ...payload,
            hystoryLog: createdHistoryLog,
          });

          created += 1;
          continue;
        }

        const latestLease = existing.leaseContracts[0] ?? null;

        const changedFieldMessages = getChangedFieldMessages([
          {
            label: "Department",
            before: existing.jobCode?.code ?? null,
            after: picUser.jobCodeCode,
          },
          {
            label: "Job Code",
            before: existing.departmentJobCode?.code ?? null,
            after: picUser.departmentJobCodeCode,
          },
          {
            label: "PIC Name",
            before: existing.picNameRaw,
            after: picUser.name,
          },
          {
            label: "Category",
            before: existing.category?.name ?? null,
            after: payload.category,
          },
          {
            label: "Model",
            before: existing.model?.name ?? null,
            after: payload.model,
          },
          {
            label: "Host Name",
            before: existing.hostName,
            after: payload.hostName,
          },
          {
            label: "User Name",
            before: existing.userNameRaw,
            after: payload.userName,
          },
          {
            label: "User Email",
            before: existing.userEmailRaw,
            after: payload.userEmail,
          },
          {
            label: "Location",
            before: existing.locationRaw,
            after: payload.location,
          },
          {
            label: "IP List",
            before: existing.ipListRaw,
            after: payload.ipList,
          },
          {
            label: "Start Date",
            before: formatDate(latestLease?.startDate),
            after: formatDate(payload.startDate),
          },
          {
            label: "End Date",
            before: formatDate(latestLease?.endDate),
            after: formatDate(payload.endDate),
          },
          {
            label: "Lease Status",
            before: latestLease?.leaseStatus,
            after: payload.leaseStatus,
          },
          {
            label: "Keterangan",
            before: existing.notes,
            after: payload.keterangan,
          },
          {
            label: "Bitlocker Key",
            before: existing.bitlockerKey,
            after: payload.bitlockerKey,
          },
        ]);

        const importMessage = changedFieldMessages.length
          ? `Data perangkat diimport oleh ${actorName} (baris ${row.rowNumber}): ${changedFieldMessages.join("; ")}`
          : `Import Excel oleh ${actorName} (baris ${row.rowNumber}) tanpa perubahan data.`;
        const updatedHistoryLog = appendHistoryEntries(latestLease?.historyLog, [
          buildHistoryEntry(importMessage),
        ]);

        await tx.device.update({
          where: { id: existing.id },
          data: {
            legacyNo: existing.legacyNo,
            serialNumber: payload.serialNo,
            hostName: payload.hostName,
            userNameRaw: payload.userName,
            userEmailRaw: payload.userEmail,
            locationRaw: payload.location,
            ipListRaw: payload.ipList,
            picNameRaw: picUser.name,
            notes: payload.keterangan,
            bitlockerKey: payload.bitlockerKey,
            jobCodeId: payload.jobCodeId,
            departmentJobCodeId: payload.departmentJobCodeId,
            categoryId,
            modelId,
            locationId,
          },
        });

        await syncDeviceIps(tx, existing.id, payload.ipList);
        await syncLatestLease(tx, existing.id, {
          ...payload,
          hystoryLog: updatedHistoryLog,
        }, latestLease?.id);

        updated += 1;
      }
    });

    res.json({
      message: "Import Data Perangkat berhasil.",
      data: {
        total: preparedRows.length,
        created,
        updated,
      },
    });
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: `Ukuran file maksimal ${Math.floor(MAX_DEVICE_IMPORT_FILE_SIZE / (1024 * 1024))} MB.`,
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Serial No. sudah terdaftar." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});
deviceRecordRouter.post("/device-records/export", async (req, res, next) => {
  try {
    const scope = await resolveDataScope(req);
    const requestedIds = parseExportRequestIds(req.body);

    const where: Prisma.DeviceWhereInput =
      scope.editorRole === "user"
        ? { jobCodeId: scope.userJobCodeId ?? undefined }
        : {};

    if (requestedIds.length > 0) {
      where.id = { in: requestedIds };
    }

    const rows = await prisma.device.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: deviceRecordInclude,
    });

    const mappedRows = mapDevicesWithResolvedNo(rows as unknown as MappedDeviceRow[]);
    const orderedRows = reorderRowsByRequestedIds(mappedRows, requestedIds);
    const exportRows = orderedRows.map((row) => toExportRow(row));

    const worksheet = XLSX.utils.json_to_sheet(exportRows, {
      header: [...deviceExportColumns],
    });
    worksheet["!cols"] = [
      { wch: 7 },
      { wch: 12 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 28 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 44 },
      { wch: 26 },
      { wch: 30 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Perangkat");

    const fileBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const fileName = `data-perangkat-${formatExportTimestamp()}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(fileBuffer);
  } catch (error) {
    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

deviceRecordRouter.post("/device-records", async (req, res, next) => {
  try {
    const editorRole = parseEditorRole(req);
    if (editorRole !== "admin") {
      return res.status(403).json({ message: "Role user tidak diizinkan menambah data perangkat." });
    }

    const payload = parsePayload(req.body);
    const actorName = getHistoryActorName(req);

    const created = await prisma.$transaction(async (tx) => {
      const picUser = await validateJobAndPic(tx, payload);
      const { categoryId, modelId, locationId } = await resolveLookupIds(tx, payload);
      await lockLegacyNoSequence(tx);
      const nextLegacyNo = await getNextLegacyNo(tx);

      const device = await tx.device.create({
        data: {
          legacyNo: nextLegacyNo,
          serialNumber: payload.serialNo,
          hostName: payload.hostName,
          userNameRaw: payload.userName,
          userEmailRaw: payload.userEmail,
          locationRaw: payload.location,
          ipListRaw: payload.ipList,
          picNameRaw: picUser.name,
          notes: payload.keterangan,
          bitlockerKey: payload.bitlockerKey,
          jobCodeId: payload.jobCodeId,
          departmentJobCodeId: payload.departmentJobCodeId,
          categoryId,
          modelId,
          locationId,
        },
      });

      await syncDeviceIps(tx, device.id, payload.ipList);
      const createdHistoryLog = appendHistoryEntries(payload.hystoryLog, [
        buildHistoryEntry(
          `Data perangkat dibuat oleh ${actorName || picUser.name}${payload.serialNo ? ` (Serial No: ${payload.serialNo})` : ""
          }.`,
        ),
      ]);

      await syncLatestLease(tx, device.id, {
        ...payload,
        hystoryLog: createdHistoryLog,
      });

      return getMappedDeviceById(tx, device.id);
    });

    res.status(201).json({ data: created });
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

deviceRecordRouter.put("/device-records/:id", async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const { editorRole, userJobCodeId } = await resolveDataScope(req);
    const payload = parsePayload(req.body);
    const actorName = getHistoryActorName(req);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.device.findUnique({
        where: { id },
        select: {
          id: true,
          legacyNo: true,
          jobCodeId: true,
          departmentJobCodeId: true,
          serialNumber: true,
          hostName: true,
          userNameRaw: true,
          userEmailRaw: true,
          locationRaw: true,
          ipListRaw: true,
          picNameRaw: true,
          notes: true,
          bitlockerKey: true,
          departmentJobCode: {
            select: { code: true },
          },
          jobCode: {
            select: { code: true },
          },
          category: {
            select: { name: true },
          },
          model: {
            select: { name: true },
          },
          leaseContracts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              startDate: true,
              endDate: true,
              daysLease: true,
              leaseStatus: true,
              historyLog: true,
            },
          },
        },
      });

      if (!existing) {
        throw new Error("DATA_PERANGKAT_NOT_FOUND");
      }

      if (editorRole === "user" && existing.jobCodeId !== userJobCodeId) {
        throw new Error("ROLE_USER_SCOPE_FORBIDDEN");
      }

      const picUser = await validateJobAndPic(tx, payload);
      const { categoryId, modelId, locationId } = await resolveLookupIds(tx, payload);
      const latestLease = existing.leaseContracts[0] ?? null;

      let resolvedLegacyNo = existing.legacyNo;
      if (!(typeof resolvedLegacyNo === "number" && Number.isFinite(resolvedLegacyNo) && resolvedLegacyNo > 0)) {
        await lockLegacyNoSequence(tx);
        resolvedLegacyNo = await getNextLegacyNo(tx);
      }

      if (editorRole === "user") {
        const restrictedChangedLabels = getChangedFieldLabels([
          {
            label: "NO",
            before: existing.legacyNo,
            after: resolvedLegacyNo,
          },
          {
            label: "Department",
            before: existing.jobCodeId,
            after: payload.jobCodeId,
          },
          {
            label: "PIC Name",
            before: existing.picNameRaw,
            after: picUser.name,
          },
          {
            label: "Serial No.",
            before: existing.serialNumber,
            after: payload.serialNo,
          },
          {
            label: "Category",
            before: existing.category?.name ?? null,
            after: payload.category,
          },
          {
            label: "Model",
            before: existing.model?.name ?? null,
            after: payload.model,
          },
          {
            label: "Host Name",
            before: existing.hostName,
            after: payload.hostName,
          },
          {
            label: "Start Date",
            before: formatDate(latestLease?.startDate),
            after: formatDate(payload.startDate),
          },
          {
            label: "End Date",
            before: formatDate(latestLease?.endDate),
            after: formatDate(payload.endDate),
          },
          {
            label: "Lease Status",
            before: latestLease?.leaseStatus,
            after: payload.leaseStatus,
          },
          {
            label: "Bitlocker Key",
            before: existing.bitlockerKey,
            after: payload.bitlockerKey,
          },
        ]);

        if (restrictedChangedLabels.length > 0) {
          throw new Error(`ROLE_USER_FORBIDDEN_FIELDS:${restrictedChangedLabels.join(", ")}`);
        }
      }

      const changedFieldMessages = getChangedFieldMessages([
        {
          label: "NO",
          before: existing.legacyNo,
          after: resolvedLegacyNo,
        },
        {
          label: "Department",
          before: existing.jobCode?.code ?? null,
          after: picUser.jobCodeCode,
        },
        {
          label: "Job Code",
          before: existing.departmentJobCode?.code ?? null,
          after: picUser.departmentJobCodeCode,
        },
        {
          label: "PIC Name",
          before: existing.picNameRaw,
          after: picUser.name,
        },
        {
          label: "Serial No.",
          before: existing.serialNumber,
          after: payload.serialNo,
        },
        {
          label: "Category",
          before: existing.category?.name ?? null,
          after: payload.category,
        },
        {
          label: "Model",
          before: existing.model?.name ?? null,
          after: payload.model,
        },
        {
          label: "Host Name",
          before: existing.hostName,
          after: payload.hostName,
        },
        {
          label: "User Name",
          before: existing.userNameRaw,
          after: payload.userName,
        },
        {
          label: "User Email",
          before: existing.userEmailRaw,
          after: payload.userEmail,
        },
        {
          label: "Location",
          before: existing.locationRaw,
          after: payload.location,
        },
        {
          label: "IP List",
          before: existing.ipListRaw,
          after: payload.ipList,
        },
        {
          label: "Start Date",
          before: formatDate(latestLease?.startDate),
          after: formatDate(payload.startDate),
        },
        {
          label: "End Date",
          before: formatDate(latestLease?.endDate),
          after: formatDate(payload.endDate),
        },
        {
          label: "Lease Status",
          before: latestLease?.leaseStatus,
          after: payload.leaseStatus,
        },
        {
          label: "Keterangan",
          before: existing.notes,
          after: payload.keterangan,
        },
        {
          label: "Bitlocker Key",
          before: existing.bitlockerKey,
          after: payload.bitlockerKey,
        },
      ]);
      const historyEntries = changedFieldMessages.length
        ? [
          buildHistoryEntry(
            `Data perangkat diubah oleh ${actorName}: ${changedFieldMessages.join("; ")}`,
          ),
        ]
        : [];
      const updatedHistoryLog = appendHistoryEntries(latestLease?.historyLog, historyEntries);

      await tx.device.update({
        where: { id },
        data: {
          legacyNo: resolvedLegacyNo,
          serialNumber: payload.serialNo,
          hostName: payload.hostName,
          userNameRaw: payload.userName,
          userEmailRaw: payload.userEmail,
          locationRaw: payload.location,
          ipListRaw: payload.ipList,
          picNameRaw: picUser.name,
          notes: payload.keterangan,
          bitlockerKey: payload.bitlockerKey,
          jobCodeId: payload.jobCodeId,
          departmentJobCodeId: payload.departmentJobCodeId,
          categoryId,
          modelId,
          locationId,
        },
      });

      await syncDeviceIps(tx, id, payload.ipList);
      await syncLatestLease(
        tx,
        id,
        {
          ...payload,
          hystoryLog: updatedHistoryLog,
        },
        latestLease?.id,
      );

      return getMappedDeviceById(tx, id);
    });

    res.json({ data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Serial No. sudah terdaftar." });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "DATA_PERANGKAT_NOT_FOUND") {
      return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_SCOPE_FORBIDDEN") {
      return res.status(403).json({ message: "Role user tidak diizinkan mengakses data perangkat di Department lain." });
    }

    if (error instanceof Error && error.message.startsWith("ROLE_USER_FORBIDDEN_FIELDS:")) {
      const changedColumns = error.message.replace("ROLE_USER_FORBIDDEN_FIELDS:", "").trim();
      return res.status(403).json({
        message: `Role user hanya boleh edit kolom Job Code, User Name, User Email, Location, IP List, dan Keterangan. Kolom tidak diizinkan: ${changedColumns}.`,
      });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

deviceRecordRouter.delete("/device-records/:id", async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const { editorRole, userJobCodeId } = await resolveDataScope(req);

    if (editorRole === "user") {
      const target = await prisma.device.findUnique({
        where: { id },
        select: { id: true, jobCodeId: true },
      });

      if (!target) {
        return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
      }

      if (target.jobCodeId !== userJobCodeId) {
        return res.status(403).json({ message: "Role user tidak diizinkan menghapus data perangkat di Department lain." });
      }
    }

    await prisma.device.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    next(error);
  }
});
