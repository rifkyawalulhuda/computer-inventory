import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import multer from "multer";
import { type Request, type Response, Router } from "express";
import XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/auth";

export const emailRecordRouter = Router();

type EditorRole = "admin" | "user";

type EmailRecordPayload = {
  no: number | null;
  departmentId: number;
  departmentJobCodeId: number;
  userName: string;
  email: string;
  location: string | null;
  licenseType: string;
  password: string | null;
  keterangan: string | null;
};

type EmailImportFileRow = {
  rowNumber: number;
  no?: string;
  department: string;
  jobCode: string;
  userName: string;
  email: string;
  location: string;
  licenseType: string;
  password: string;
  keterangan: string;
};

type PreparedEmailImportRow = {
  rowNumber: number;
  payload: EmailRecordPayload;
};

type EmailImportFailureDetail = {
  rowNumber: number | null;
  reason: string;
};

type EmailImportResult = {
  success: boolean;
  message: string;
  totalRowsRead: number;
  validRows: number;
  failedRows: number;
  importedRows: number;
  created: number;
  updated: number;
  allOrNothing: true;
  importCancelled: boolean;
  failureDetails: EmailImportFailureDetail[];
};

const EMAIL_LICENSE_TYPES = [
  "Miccrosoft 365 Business Basic",
  "Miccrosoft 365 Business Standard",
  "Miccrosoft 365 E1",
] as const;

const EMAIL_IMPORT_TEMPLATE_HEADERS = [
  "Department",
  "Job Code",
  "Nama User",
  "Email",
  "Location",
  "Jenis License",
  "Password",
  "Keterangan",
] as const;
const EMAIL_IMPORT_LEGACY_TEMPLATE_HEADERS = ["No", ...EMAIL_IMPORT_TEMPLATE_HEADERS] as const;

const MAX_EMAIL_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
const EMAIL_IMPORT_DROPDOWN_MAX_ROWS = 1000;
const EMAIL_LEGACY_NO_LOCK_KEY = 9042026;
const ADMIN_EMAIL_CREATE_NOTIFICATION_PREFIX = "ADMIN_EMAIL_CREATE_NOTIFY";
const ADMIN_EMAIL_DELETE_NOTIFICATION_TYPE = "ADMIN_DELETED";

const emailImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_EMAIL_IMPORT_FILE_SIZE,
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

function formatHistoryTimestamp(date = new Date()): string {
  const year = date.getFullYear();
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

function appendHistoryEntries(existingHistory: string | null | undefined, entries: string[]): string | null {
  const base = toNullableText(existingHistory);
  const cleanEntries = entries.map((entry) => cleanText(entry)).filter(Boolean);
  if (!cleanEntries.length) {
    return base;
  }

  return base ? `${base}\n${cleanEntries.join("\n")}` : cleanEntries.join("\n");
}

type AdminEmailCreateNotificationEntry = {
  recipientUserId: string;
  actorName: string;
  department: string;
  jobCode: string;
  userName: string;
  email: string;
  licenseType: string;
};

function buildAdminEmailCreateNotificationMarker(entry: AdminEmailCreateNotificationEntry): string {
  const parts: Array<[string, string]> = [
    ["recipientUserId", entry.recipientUserId],
    ["actorName", entry.actorName],
    ["department", entry.department],
    ["jobCode", entry.jobCode],
    ["userName", entry.userName],
    ["email", entry.email],
    ["licenseType", entry.licenseType],
  ];

  return `${ADMIN_EMAIL_CREATE_NOTIFICATION_PREFIX}|${parts
    .map(([key, value]) => `${key}=${encodeURIComponent(cleanText(value))}`)
    .join("|")}`;
}

function getActorName(req: Request): string {
  return cleanText(req.authUser?.name) || "Admin";
}

class EmailImportValidationError extends Error {
  importResult: EmailImportResult;

  constructor(message: string, importResult: EmailImportResult) {
    super(message);
    this.name = "EmailImportValidationError";
    this.importResult = importResult;
  }
}

function createEmailImportFailureResult(args: {
  message?: string;
  totalRowsRead: number;
  validRows: number;
  failureDetails: EmailImportFailureDetail[];
}): EmailImportResult {
  const message = cleanText(args.message)
    || "Import dibatalkan. Terdapat data gagal, sehingga seluruh data pada file tidak disimpan.";
  const failureDetails = args.failureDetails
    .map((detail) => ({
      rowNumber: typeof detail.rowNumber === "number" && detail.rowNumber > 0 ? detail.rowNumber : null,
      reason: cleanText(detail.reason),
    }))
    .filter((detail) => detail.reason);

  return {
    success: false,
    message,
    totalRowsRead: Math.max(0, args.totalRowsRead),
    validRows: Math.max(0, args.validRows),
    failedRows: failureDetails.length,
    importedRows: 0,
    created: 0,
    updated: 0,
    allOrNothing: true,
    importCancelled: true,
    failureDetails,
  };
}

function createEmailImportSuccessResult(args: {
  totalRowsRead: number;
  created: number;
  updated: number;
}): EmailImportResult {
  const totalRowsRead = Math.max(0, args.totalRowsRead);
  const created = Math.max(0, args.created);
  const updated = Math.max(0, args.updated);
  return {
    success: true,
    message: `Import berhasil. ${totalRowsRead} data valid telah diproses dan tidak ada data gagal.`,
    totalRowsRead,
    validRows: totalRowsRead,
    failedRows: 0,
    importedRows: totalRowsRead,
    created,
    updated,
    allOrNothing: true,
    importCancelled: false,
    failureDetails: [],
  };
}

function toNullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

function parseInteger(value: unknown, label: string, options?: { min?: number }): number | null {
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

function normalizeLicenseType(value: unknown): string {
  const text = cleanText(value);
  if (!text) {
    throw new Error("Jenis License wajib dipilih.");
  }

  const matched = EMAIL_LICENSE_TYPES.find((item) => item.toLowerCase() === text.toLowerCase());
  if (!matched) {
    throw new Error("Jenis License tidak valid.");
  }

  return matched;
}

function normalizeImportHeaderText(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.]/g, "");
}

function resolveEmailImportTemplateHeaderOffset(headerRow: unknown[]): number {
  const normalizedHeaderRow = headerRow.map((header) => normalizeImportHeaderText(header));
  const currentExpected = EMAIL_IMPORT_TEMPLATE_HEADERS.map((header) => normalizeImportHeaderText(header));
  const legacyExpected = EMAIL_IMPORT_LEGACY_TEMPLATE_HEADERS.map((header) => normalizeImportHeaderText(header));
  const currentActual = normalizedHeaderRow.slice(0, EMAIL_IMPORT_TEMPLATE_HEADERS.length);
  const legacyActual = normalizedHeaderRow.slice(0, EMAIL_IMPORT_LEGACY_TEMPLATE_HEADERS.length);

  const isCurrentTemplate =
    currentExpected.length === currentActual.length
    && currentExpected.every((header, index) => header === currentActual[index]);
  if (isCurrentTemplate) {
    return 0;
  }

  const isLegacyTemplate =
    legacyExpected.length === legacyActual.length
    && legacyExpected.every((header, index) => header === legacyActual[index]);
  if (isLegacyTemplate) {
    return 1;
  }

  throw new Error(
    `Header template tidak sesuai. Gunakan urutan: ${EMAIL_IMPORT_TEMPLATE_HEADERS.join(", ")}.`,
  );
}

function parseEditorRole(req: Request): EditorRole {
  if (req.authUser?.role === "admin" || req.authUser?.role === "user") {
    return req.authUser.role;
  }

  const body = req.body as Record<string, unknown> | null | undefined;
  const rawRole = cleanText(req.header("x-user-role") ?? body?.editorRole).toLowerCase();
  return rawRole === "user" ? "user" : "admin";
}

async function getAssignedDepartmentId(req: Request): Promise<number | null> {
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

async function resolveDataScope(req: Request): Promise<{ editorRole: EditorRole; userDepartmentId: number | null }> {
  const editorRole = parseEditorRole(req);
  if (editorRole === "admin") {
    return { editorRole, userDepartmentId: null };
  }

  const userDepartmentId = await getAssignedDepartmentId(req);
  if (!userDepartmentId) {
    throw new Error("ROLE_USER_JOB_CODE_NOT_FOUND");
  }

  return { editorRole, userDepartmentId };
}

async function lockEmailLegacyNoSequence(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${EMAIL_LEGACY_NO_LOCK_KEY})`);
}

async function getNextEmailLegacyNo(tx: Prisma.TransactionClient): Promise<number> {
  const maxLegacyNo = (await tx.emailAccount.aggregate({ _max: { legacyNo: true } }))._max.legacyNo ?? 0;
  return maxLegacyNo + 1;
}

function parsePayload(payload: unknown): EmailRecordPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload tidak valid.");
  }

  const body = payload as Record<string, unknown>;
  const no = parseInteger(body.no, "No", { min: 1 });
  const departmentId = Number(body.departmentId);
  const departmentJobCodeId = Number(body.departmentJobCodeId);
  const userName = cleanText(body.userName);
  const email = cleanText(body.email).toLowerCase();
  const location = toNullableText(body.location);
  const licenseType = normalizeLicenseType(body.licenseType);
  const password = toNullableText(body.password);
  const keterangan = toNullableText(body.keterangan);

  if (!Number.isInteger(departmentId) || departmentId < 1) {
    throw new Error("Department wajib dipilih.");
  }

  if (!Number.isInteger(departmentJobCodeId) || departmentJobCodeId < 1) {
    throw new Error("Job Code wajib dipilih.");
  }

  if (!userName) {
    throw new Error("Nama User wajib diisi.");
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email tidak valid.");
  }

  if (location && location.length > 191) {
    throw new Error("Location maksimal 191 karakter.");
  }

  if (password && password.length > 500) {
    throw new Error("Password maksimal 500 karakter.");
  }

  if (keterangan && keterangan.length > 2000) {
    throw new Error("Keterangan maksimal 2000 karakter.");
  }

  return {
    no,
    departmentId,
    departmentJobCodeId,
    userName,
    email,
    location,
    licenseType,
    password,
    keterangan,
  };
}

async function validateDepartmentAndJobCode(
  tx: Prisma.TransactionClient,
  payload: EmailRecordPayload,
): Promise<{ locationId: number | null }> {
  const department = await tx.department.findUnique({
    where: { id: payload.departmentId },
    select: { id: true },
  });

  if (!department) {
    throw new Error("Department tidak ditemukan.");
  }

  const jobCode = await tx.departmentJobCode.findUnique({
    where: { id: payload.departmentJobCodeId },
    select: { id: true, departmentId: true },
  });

  if (!jobCode) {
    throw new Error("Job Code tidak ditemukan.");
  }

  if (jobCode.departmentId !== payload.departmentId) {
    throw new Error("Job Code harus sesuai dengan Department yang dipilih.");
  }

  let locationId: number | null = null;
  if (payload.location) {
    const existingLocation = await tx.location.findUnique({
      where: { name: payload.location },
      select: { id: true },
    });

    if (existingLocation) {
      locationId = existingLocation.id;
    } else {
      const createdLocation = await tx.location.create({
        data: { name: payload.location },
        select: { id: true },
      });
      locationId = createdLocation.id;
    }
  }

  return { locationId };
}

const emailAccountInclude = {
  department: {
    select: {
      id: true,
      code: true,
      siteName: true,
    },
  },
  departmentJobCode: {
    select: {
      id: true,
      code: true,
    },
  },
  location: {
    select: {
      id: true,
      name: true,
    },
  },
  assignedDevice: {
    select: {
      id: true,
      hostName: true,
      serialNumber: true,
      userEmailRaw: true,
      updatedAt: true,
    },
  },
} as const;

type EmailAccountWithRelations = Prisma.EmailAccountGetPayload<{
  include: typeof emailAccountInclude;
}>;

async function loadAssignedDevicesForEmails(
  rows: EmailAccountWithRelations[],
): Promise<Map<string, { id: string; hostName: string | null; serialNumber: string | null }>> {
  const assignedMap = new Map<string, { id: string; hostName: string | null; serialNumber: string | null }>();

  rows.forEach((row) => {
    if (row.assignedDevice?.id) {
      assignedMap.set(row.id, {
        id: row.assignedDevice.id,
        hostName: row.assignedDevice.hostName,
        serialNumber: row.assignedDevice.serialNumber,
      });
    }
  });

  const unresolvedRows = rows.filter((row) => !assignedMap.has(row.id));
  if (!unresolvedRows.length) {
    return assignedMap;
  }

  const emailValues = [...new Set(unresolvedRows.map((row) => cleanText(row.email).toLowerCase()).filter(Boolean))];
  if (!emailValues.length) {
    return assignedMap;
  }

  const devices = await prisma.device.findMany({
    where: {
      OR: [
        {
          userEmailRaw: {
            in: emailValues,
          },
        },
        {
          emailAccountId: {
            in: unresolvedRows.map((row) => row.id),
          },
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      emailAccountId: true,
      userEmailRaw: true,
      hostName: true,
      serialNumber: true,
    },
  });

  const byEmail = new Map<string, { id: string; hostName: string | null; serialNumber: string | null }>();
  devices.forEach((device) => {
    const emailValue = cleanText(device.userEmailRaw).toLowerCase();
    if (device.emailAccountId && !assignedMap.has(device.emailAccountId)) {
      assignedMap.set(device.emailAccountId, {
        id: device.id,
        hostName: device.hostName,
        serialNumber: device.serialNumber,
      });
    }

    if (emailValue && !byEmail.has(emailValue)) {
      byEmail.set(emailValue, {
        id: device.id,
        hostName: device.hostName,
        serialNumber: device.serialNumber,
      });
    }
  });

  unresolvedRows.forEach((row) => {
    if (assignedMap.has(row.id)) {
      return;
    }

    const fallbackDevice = byEmail.get(cleanText(row.email).toLowerCase());
    if (fallbackDevice) {
      assignedMap.set(row.id, fallbackDevice);
    }
  });

  return assignedMap;
}

async function syncDirectDeviceRelationForEmail(
  tx: Prisma.TransactionClient,
  emailAccountId: string,
  email: string,
): Promise<void> {
  const normalizedEmail = cleanText(email).toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  const matchingDevices = await tx.device.findMany({
    where: {
      userEmailRaw: normalizedEmail,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, emailAccountId: true },
  });

  if (!matchingDevices.length) {
    return;
  }

  const primaryDevice = matchingDevices[0];
  if (primaryDevice.emailAccountId !== emailAccountId) {
    await tx.device.update({
      where: { id: primaryDevice.id },
      data: { emailAccountId },
    });
  }

  const staleAssignments = matchingDevices.slice(1).filter((device) => device.emailAccountId === emailAccountId);
  for (const device of staleAssignments) {
    await tx.device.update({
      where: { id: device.id },
      data: { emailAccountId: null },
    });
  }
}

function mapEmailRow(
  row: EmailAccountWithRelations,
  assignedDeviceMap: Map<string, { id: string; hostName: string | null; serialNumber: string | null }>,
  fallbackNo?: number,
) {
  const assignedDevice = assignedDeviceMap.get(row.id);
  return {
    id: row.id,
    "No": row.legacyNo ?? fallbackNo ?? "",
    "Nama User": row.userName,
    "Email": row.email,
    "Department": cleanText(row.department?.code),
    "Job Code": cleanText(row.departmentJobCode?.code),
    "Location": row.location?.name || row.locationRaw || "",
    "Jenis License": row.licenseType,
    "Password": row.password || "",
    "Keterangan": row.notes || "",
    "Perangkat": assignedDevice?.hostName || "",
    "Device Id": assignedDevice?.id || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function reorderRowsByRequestedIds<T extends { id: string }>(rows: T[], requestedIds: string[]): T[] {
  const order = new Map(requestedIds.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => {
    const orderA = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const orderB = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return 0;
  });
}

function parseEmailImportRows(sheet: XLSX.WorkSheet): EmailImportFileRow[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  if (!rows.length) {
    throw new Error("File Excel kosong.");
  }

  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const headerOffset = resolveEmailImportTemplateHeaderOffset(headerRow);

  const parsedRows: EmailImportFileRow[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const rawRow = Array.isArray(rows[index]) ? rows[index] : [];
    const values = Array.from(
      { length: EMAIL_IMPORT_TEMPLATE_HEADERS.length },
      (_value, idx) => rawRow[idx + headerOffset],
    );
    const hasValue = values.some((value) => cleanText(value));
    if (!hasValue) {
      continue;
    }

    parsedRows.push({
      rowNumber: index + 1,
      no: headerOffset === 1 ? cleanText(rawRow[0]) : "",
      department: cleanText(values[0]),
      jobCode: cleanText(values[1]),
      userName: cleanText(values[2]),
      email: cleanText(values[3]),
      location: cleanText(values[4]),
      licenseType: cleanText(values[5]),
      password: cleanText(values[6]),
      keterangan: cleanText(values[7]),
    });
  }

  if (!parsedRows.length) {
    throw new Error("Tidak ada data yang bisa diimport.");
  }

  return parsedRows;
}

async function createEmailImportTemplateWorkbookBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const templateSheet = workbook.addWorksheet("Template");
  const instructionSheet = workbook.addWorksheet("Instruksi");
  const referenceSheet = workbook.addWorksheet("Referensi");

  const departments = await prisma.department.findMany({
    orderBy: [{ code: "asc" }, { siteName: "asc" }],
    include: {
      jobCodes: {
        orderBy: { code: "asc" },
        select: { code: true },
      },
    },
  });

  const departmentRefs = departments.map((department) => `${department.code} - ${department.siteName}`);
  const jobCodeRefs = departments.flatMap((department) => department.jobCodes.map((jobCode) => jobCode.code));

  templateSheet.addRow([...EMAIL_IMPORT_TEMPLATE_HEADERS]);
  templateSheet.addRow([
    departmentRefs[0] || "",
    jobCodeRefs[0] || "",
    "Nama User",
    "user@example.com",
    "Location",
    EMAIL_LICENSE_TYPES[0],
    "optional-password",
    "Catatan tambahan",
  ]);

  templateSheet.columns = [
    { width: 30 },
    { width: 18 },
    { width: 28 },
    { width: 34 },
    { width: 24 },
    { width: 36 },
    { width: 24 },
    { width: 40 },
  ];

  const headerRow = templateSheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D9EAFD" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "AFC8E7" } },
      left: { style: "thin", color: { argb: "AFC8E7" } },
      bottom: { style: "thin", color: { argb: "AFC8E7" } },
      right: { style: "thin", color: { argb: "AFC8E7" } },
    };
  });

  referenceSheet.columns = [
    { width: 30 },
    { width: 18 },
    { width: 36 },
  ];
  referenceSheet.getCell("A1").value = "Department";
  referenceSheet.getCell("B1").value = "Job Code";
  referenceSheet.getCell("C1").value = "Jenis License";

  const maxRefRows = Math.max(departmentRefs.length, jobCodeRefs.length, EMAIL_LICENSE_TYPES.length);
  for (let index = 0; index < maxRefRows; index += 1) {
    referenceSheet.getCell(`A${index + 2}`).value = departmentRefs[index] || "";
    referenceSheet.getCell(`B${index + 2}`).value = jobCodeRefs[index] || "";
    referenceSheet.getCell(`C${index + 2}`).value = EMAIL_LICENSE_TYPES[index] || "";
  }

  for (let row = 2; row <= EMAIL_IMPORT_DROPDOWN_MAX_ROWS; row += 1) {
    templateSheet.getCell(row, 1).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`Referensi!$A$2:$A$${Math.max(departmentRefs.length + 1, 2)}`],
    };
    templateSheet.getCell(row, 2).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`Referensi!$B$2:$B$${Math.max(jobCodeRefs.length + 1, 2)}`],
    };
    templateSheet.getCell(row, 6).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`Referensi!$C$2:$C$${Math.max(EMAIL_LICENSE_TYPES.length + 1, 2)}`],
    };
  }

  instructionSheet.addRows([
    ["Panduan Import Data Email"],
    ["1. Isi data mulai baris ke-2 di sheet Template."],
    ["2. Kolom wajib: Department, Job Code, Nama User, Email, Jenis License."],
    ["3. Kolom Location, Password, dan Keterangan boleh dikosongkan."],
    ["4. Department harus memakai format 'CODE - Site Name' seperti di dropdown template."],
    ["5. Job Code harus sesuai dengan Department yang dipilih."],
    ["6. Kolom No tidak perlu diisi karena akan digenerate otomatis oleh sistem."],
    ["7. Email yang sudah ada akan diupdate otomatis saat import ulang."],
  ]);
  instructionSheet.getColumn(1).width = 120;
  instructionSheet.getRow(1).font = { bold: true };
  referenceSheet.state = "veryHidden";

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function runEmailImportUpload(req: Request, res: Response): Promise<void> {
  const uploadMiddleware = emailImportUpload.single("file");
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

async function prepareEmailImportRows(rows: EmailImportFileRow[]): Promise<PreparedEmailImportRow[]> {
  const departments = await prisma.department.findMany({
    orderBy: [{ code: "asc" }, { siteName: "asc" }],
    include: {
      jobCodes: {
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
        },
      },
    },
  });

  const departmentByDisplay = new Map(
    departments.map((department) => [`${department.code} - ${department.siteName}`.toLowerCase(), department]),
  );
  const failureDetails: EmailImportFailureDetail[] = [];
  const preparedRows: PreparedEmailImportRow[] = [];
  const seenNos = new Set<number>();
  const seenEmails = new Set<string>();

  rows.forEach((row) => {
    try {
      const department = departmentByDisplay.get(row.department.toLowerCase());
      if (!department) {
        throw new Error(`Department "${row.department}" tidak ditemukan.`);
      }

      const jobCode = department.jobCodes.find((item) => cleanText(item.code).toLowerCase() === row.jobCode.toLowerCase());
      if (!jobCode) {
        throw new Error(`Job Code "${row.jobCode}" tidak ditemukan untuk Department "${row.department}".`);
      }

      const payload = parsePayload({
        no: row.no,
        departmentId: department.id,
        departmentJobCodeId: jobCode.id,
        userName: row.userName,
        email: row.email,
        location: row.location,
        licenseType: row.licenseType,
        password: row.password,
        keterangan: row.keterangan,
      });

      if (payload.no && seenNos.has(payload.no)) {
        throw new Error(`No "${payload.no}" duplikat di file import.`);
      }

      if (seenEmails.has(payload.email)) {
        throw new Error(`Email "${payload.email}" duplikat di file import.`);
      }

      if (payload.no) {
        seenNos.add(payload.no);
      }
      seenEmails.add(payload.email);

      preparedRows.push({
        rowNumber: row.rowNumber,
        payload,
      });
    } catch (error) {
      failureDetails.push({
        rowNumber: row.rowNumber,
        reason: error instanceof Error ? error.message : "Validasi gagal.",
      });
    }
  });

  if (failureDetails.length) {
    throw new EmailImportValidationError(
      "Import dibatalkan. Terdapat data gagal, sehingga seluruh data pada file tidak disimpan.",
      createEmailImportFailureResult({
        totalRowsRead: rows.length,
        validRows: preparedRows.length,
        failureDetails,
      }),
    );
  }

  if (!preparedRows.length) {
    throw new EmailImportValidationError(
      "Import dibatalkan. Tidak ada data valid yang dapat diproses.",
      createEmailImportFailureResult({
        message: "Import dibatalkan. Tidak ada data valid yang dapat diproses.",
        totalRowsRead: rows.length,
        validRows: 0,
        failureDetails: [
          {
            rowNumber: null,
            reason: "Tidak ada data valid yang bisa diimport.",
          },
        ],
      }),
    );
  }

  return preparedRows;
}

function getForbiddenUserFieldChanges(
  existing: {
    departmentId: number;
    departmentJobCodeId: number | null;
    userName: string;
    email: string;
    locationRaw: string | null;
    licenseType: string;
  },
  payload: EmailRecordPayload,
): string[] {
  const changed: string[] = [];
  if (existing.departmentId !== payload.departmentId) {
    changed.push("Department");
  }
  if ((existing.departmentJobCodeId ?? null) !== payload.departmentJobCodeId) {
    changed.push("Job Code");
  }
  if (cleanText(existing.userName) !== cleanText(payload.userName)) {
    changed.push("Nama User");
  }
  if (cleanText(existing.email).toLowerCase() !== cleanText(payload.email).toLowerCase()) {
    changed.push("Email");
  }
  if (cleanText(existing.locationRaw) !== cleanText(payload.location)) {
    changed.push("Location");
  }
  if (cleanText(existing.licenseType) !== cleanText(payload.licenseType)) {
    changed.push("Jenis License");
  }
  return changed;
}

emailRecordRouter.get("/email-records", async (req, res, next) => {
  try {
    const scope = await resolveDataScope(req);
    const where: Prisma.EmailAccountWhereInput = {};
    if (scope.editorRole === "user") {
      where.departmentId = scope.userDepartmentId ?? undefined;
    }

    const rows = await prisma.emailAccount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: emailAccountInclude,
    });

    const assignedDeviceMap = await loadAssignedDevicesForEmails(rows);
    const mappedRows = rows.map((row, index) => mapEmailRow(row, assignedDeviceMap, index + 1));
    res.json({ data: mappedRows });
  } catch (error) {
    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    next(error);
  }
});

emailRecordRouter.get("/email-records/import-template", requireRole("admin"), async (_req, res, next) => {
  try {
    const buffer = await createEmailImportTemplateWorkbookBuffer();
    const fileName = "template-data-email.xlsx";

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

emailRecordRouter.get("/email-records/options", async (req, res, next) => {
  try {
    const scope = await resolveDataScope(req);
    const requestedDepartmentId = Number(req.query.departmentId);
    const departmentId = Number.isInteger(requestedDepartmentId) && requestedDepartmentId > 0
      ? requestedDepartmentId
      : scope.userDepartmentId ?? null;

    if (!departmentId) {
      return res.status(400).json({ message: "Department wajib dipilih." });
    }

    if (scope.editorRole === "user" && departmentId !== scope.userDepartmentId) {
      return res.status(403).json({ message: "Role user tidak diizinkan mengakses Data Email di Department lain." });
    }

    const rows = await prisma.emailAccount.findMany({
      where: { departmentId },
      orderBy: [
        { userName: "asc" },
        { email: "asc" },
      ],
      select: {
        id: true,
        departmentId: true,
        departmentJobCodeId: true,
        userName: true,
        email: true,
      },
    });

    res.json({
      data: rows.map((row) => ({
        id: row.id,
        departmentId: row.departmentId,
        departmentJobCodeId: row.departmentJobCodeId,
        userName: cleanText(row.userName),
        email: cleanText(row.email).toLowerCase(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    next(error);
  }
});

emailRecordRouter.get("/email-records/:id", async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const scope = await resolveDataScope(req);
    const row = await prisma.emailAccount.findUnique({
      where: { id },
      include: emailAccountInclude,
    });

    if (!row) {
      return res.status(404).json({ message: "Data Email tidak ditemukan." });
    }

    if (scope.editorRole === "user" && row.departmentId !== scope.userDepartmentId) {
      return res.status(403).json({ message: "Role user tidak diizinkan mengakses Data Email di Department lain." });
    }

    const assignedDeviceMap = await loadAssignedDevicesForEmails([row]);
    res.json({ data: mapEmailRow(row, assignedDeviceMap, row.legacyNo ?? 1) });
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

emailRecordRouter.post("/email-records", requireRole("admin"), async (req, res, next) => {
  try {
    const payload = parsePayload(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const { locationId } = await validateDepartmentAndJobCode(tx, payload);
      let legacyNo = payload.no;
      if (!legacyNo) {
        await lockEmailLegacyNoSequence(tx);
        legacyNo = await getNextEmailLegacyNo(tx);
      }

      const row = await tx.emailAccount.create({
        data: {
          legacyNo,
          departmentId: payload.departmentId,
          departmentJobCodeId: payload.departmentJobCodeId,
          userName: payload.userName,
          email: payload.email,
          locationRaw: payload.location,
          locationId,
          licenseType: payload.licenseType,
          password: payload.password,
          notes: payload.keterangan,
        },
        include: emailAccountInclude,
      });

      await syncDirectDeviceRelationForEmail(tx, row.id, row.email);
      const recipientUsers = await tx.masterUser.findMany({
        where: {
          role: "user",
          jobCodeId: payload.departmentId,
        },
        select: {
          id: true,
        },
      });
      const notificationEntries = recipientUsers.map((user) => buildHistoryEntry(buildAdminEmailCreateNotificationMarker({
        recipientUserId: user.id,
        actorName: getActorName(req),
        department: cleanText(row.department?.code),
        jobCode: cleanText(row.departmentJobCode?.code),
        userName: cleanText(row.userName),
        email: cleanText(row.email),
        licenseType: cleanText(row.licenseType),
      })));

      if (notificationEntries.length) {
        await tx.emailAccount.update({
          where: { id: row.id },
          data: {
            historyLog: appendHistoryEntries(row.historyLog, notificationEntries),
          },
        });
      }

      return tx.emailAccount.findUniqueOrThrow({
        where: { id: row.id },
        include: emailAccountInclude,
      });
    });

    const assignedDeviceMap = await loadAssignedDevicesForEmails([created]);
    res.status(201).json({ data: mapEmailRow(created, assignedDeviceMap, created.legacyNo ?? 1) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Email sudah terdaftar." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

emailRecordRouter.put("/email-records/:id", async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const scope = await resolveDataScope(req);
    const payload = parsePayload(req.body);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.emailAccount.findUnique({
        where: { id },
        select: {
          id: true,
          legacyNo: true,
          departmentId: true,
          departmentJobCodeId: true,
          userName: true,
          email: true,
          locationRaw: true,
          licenseType: true,
        },
      });

      if (!existing) {
        throw new Error("DATA_EMAIL_NOT_FOUND");
      }

      if (scope.editorRole === "user" && existing.departmentId !== scope.userDepartmentId) {
        throw new Error("ROLE_USER_SCOPE_FORBIDDEN");
      }

      if (scope.editorRole === "user") {
        const forbiddenChanges = getForbiddenUserFieldChanges(existing, payload);
        if (forbiddenChanges.length) {
          throw new Error(`ROLE_USER_FORBIDDEN_FIELDS:${forbiddenChanges.join(", ")}`);
        }

        payload.departmentId = existing.departmentId;
        payload.departmentJobCodeId = existing.departmentJobCodeId ?? payload.departmentJobCodeId;
        payload.userName = existing.userName;
        payload.email = existing.email;
        payload.location = existing.locationRaw;
        payload.licenseType = existing.licenseType;
      }

      const { locationId } = await validateDepartmentAndJobCode(tx, payload);
      const row = await tx.emailAccount.update({
        where: { id },
        data: {
          legacyNo: existing.legacyNo ?? payload.no ?? undefined,
          departmentId: payload.departmentId,
          departmentJobCodeId: payload.departmentJobCodeId,
          userName: payload.userName,
          email: payload.email,
          locationRaw: payload.location,
          locationId,
          licenseType: payload.licenseType,
          password: payload.password,
          notes: payload.keterangan,
        },
        include: emailAccountInclude,
      });

      await syncDirectDeviceRelationForEmail(tx, row.id, row.email);
      return tx.emailAccount.findUniqueOrThrow({
        where: { id },
        include: emailAccountInclude,
      });
    });

    const assignedDeviceMap = await loadAssignedDevicesForEmails([updated]);
    res.json({ data: mapEmailRow(updated, assignedDeviceMap, updated.legacyNo ?? 1) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Email sudah terdaftar." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_SCOPE_FORBIDDEN") {
      return res.status(403).json({ message: "Role user tidak diizinkan mengakses Data Email di Department lain." });
    }

    if (error instanceof Error && error.message.startsWith("ROLE_USER_FORBIDDEN_FIELDS:")) {
      const changedColumns = error.message.replace("ROLE_USER_FORBIDDEN_FIELDS:", "").trim();
      return res.status(403).json({
        message: `Role user hanya boleh edit kolom Password dan Keterangan. Kolom tidak diizinkan: ${changedColumns}.`,
      });
    }

    if (error instanceof Error && error.message === "DATA_EMAIL_NOT_FOUND") {
      return res.status(404).json({ message: "Data Email tidak ditemukan." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

emailRecordRouter.delete("/email-records/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.emailAccount.findUnique({
        where: { id },
        select: {
          id: true,
          departmentId: true,
          userName: true,
          email: true,
          licenseType: true,
          department: {
            select: {
              code: true,
            },
          },
          departmentJobCode: {
            select: {
              code: true,
            },
          },
        },
      });

      if (!existing) {
        throw new Error("DATA_EMAIL_NOT_FOUND");
      }

      const recipientUsers = await tx.masterUser.findMany({
        where: {
          role: "user",
          jobCodeId: existing.departmentId,
        },
        select: {
          id: true,
        },
      });

      if (recipientUsers.length) {
        await Promise.all(
          recipientUsers.map((user) =>
            tx.emailAccountNotificationLog.create({
              data: {
                originalEmailAccountId: existing.id,
                recipientUserId: user.id,
                notificationType: ADMIN_EMAIL_DELETE_NOTIFICATION_TYPE,
                actorName: getActorName(req),
                department: cleanText(existing.department?.code),
                jobCode: cleanText(existing.departmentJobCode?.code) || null,
                userName: cleanText(existing.userName),
                email: cleanText(existing.email),
                licenseType: cleanText(existing.licenseType) || null,
              },
            }),
          ),
        );
      }

      await tx.emailAccount.delete({ where: { id } });
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "DATA_EMAIL_NOT_FOUND") {
      return res.status(404).json({ message: "Data Email tidak ditemukan." });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({ message: "Data Email tidak ditemukan." });
    }

    next(error);
  }
});

emailRecordRouter.post("/email-records/import", requireRole("admin"), async (req, res, next) => {
  try {
    await runEmailImportUpload(req, res);
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

    let importRows: EmailImportFileRow[];
    try {
      importRows = parseEmailImportRows(firstSheet);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Template import tidak valid.";
      const importResult = createEmailImportFailureResult({
        totalRowsRead: 0,
        validRows: 0,
        failureDetails: [
          {
            rowNumber: null,
            reason,
          },
        ],
      });

      return res.status(400).json({
        message: importResult.message,
        importResult,
      });
    }

    const preparedRows = await prepareEmailImportRows(importRows);

    const stats = {
      total: preparedRows.length,
      created: 0,
      updated: 0,
    };

    const processedIds = await prisma.$transaction(async (tx) => {
      const emails = preparedRows.map((row) => row.payload.email);
      const existingRows = await tx.emailAccount.findMany({
        where: {
          email: {
            in: emails,
          },
        },
        select: {
          id: true,
          email: true,
        },
      });
      const existingByEmail = new Map(existingRows.map((row) => [row.email.toLowerCase(), row]));
      const ids: string[] = [];
      for (const row of preparedRows) {
        const existing = existingByEmail.get(row.payload.email.toLowerCase());
        const { locationId } = await validateDepartmentAndJobCode(tx, row.payload);

        let saved;
        if (existing) {
          saved = await tx.emailAccount.update({
            where: { id: existing.id },
            data: {
              legacyNo: row.payload.no ?? undefined,
              departmentId: row.payload.departmentId,
              departmentJobCodeId: row.payload.departmentJobCodeId,
              userName: row.payload.userName,
              email: row.payload.email,
              locationRaw: row.payload.location,
              locationId,
              licenseType: row.payload.licenseType,
              password: row.payload.password,
              notes: row.payload.keterangan,
            },
            select: { id: true, email: true },
          });
          stats.updated += 1;
        } else {
          let legacyNo = row.payload.no;
          if (!legacyNo) {
            await lockEmailLegacyNoSequence(tx);
            legacyNo = await getNextEmailLegacyNo(tx);
          }

          saved = await tx.emailAccount.create({
            data: {
              legacyNo,
              departmentId: row.payload.departmentId,
              departmentJobCodeId: row.payload.departmentJobCodeId,
              userName: row.payload.userName,
              email: row.payload.email,
              locationRaw: row.payload.location,
              locationId,
              licenseType: row.payload.licenseType,
              password: row.payload.password,
              notes: row.payload.keterangan,
            },
            select: { id: true, email: true },
          });
          stats.created += 1;
        }

        await syncDirectDeviceRelationForEmail(tx, saved.id, saved.email);
        ids.push(saved.id);
      }

      return ids;
    });

    const rows = await prisma.emailAccount.findMany({
      where: { id: { in: processedIds } },
      include: emailAccountInclude,
    });
    const orderedRows = reorderRowsByRequestedIds(rows, processedIds);
    const assignedDeviceMap = await loadAssignedDevicesForEmails(orderedRows);

    res.json({
      message: "Import Data Email berhasil.",
      stats,
      importResult: createEmailImportSuccessResult({
        totalRowsRead: preparedRows.length,
        created: stats.created,
        updated: stats.updated,
      }),
      data: orderedRows.map((row, index) => mapEmailRow(row, assignedDeviceMap, index + 1)),
    });
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: `Ukuran file maksimal ${Math.floor(MAX_EMAIL_IMPORT_FILE_SIZE / (1024 * 1024))} MB.`,
      });
    }

    if (error instanceof EmailImportValidationError) {
      return res.status(400).json({
        message: error.importResult.message,
        importResult: error.importResult,
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const importResult = createEmailImportFailureResult({
        totalRowsRead: 0,
        validRows: 0,
        failureDetails: [
          {
            rowNumber: null,
            reason: "Ditemukan data duplikat sehingga seluruh import dibatalkan.",
          },
        ],
      });
      return res.status(409).json({
        message: importResult.message,
        importResult,
      });
    }

    if (error instanceof Error) {
      const importResult = createEmailImportFailureResult({
        totalRowsRead: 0,
        validRows: 0,
        failureDetails: [
          {
            rowNumber: null,
            reason: error.message,
          },
        ],
      });
      return res.status(400).json({
        message: importResult.message,
        importResult,
      });
    }

    next(error);
  }
});

emailRecordRouter.post("/email-records/export", async (req, res, next) => {
  try {
    const scope = await resolveDataScope(req);
    const body = (req.body as Record<string, unknown> | null | undefined) ?? {};
    const requestedIds = Array.isArray(body.ids)
      ? body.ids.map((id) => cleanText(id)).filter(Boolean)
      : [];

    const where: Prisma.EmailAccountWhereInput = {
      ...(scope.editorRole === "user" ? { departmentId: scope.userDepartmentId ?? undefined } : {}),
      ...(requestedIds.length > 0 ? { id: { in: requestedIds } } : {}),
    };

    const rows = await prisma.emailAccount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: emailAccountInclude,
    });

    const orderedRows = requestedIds.length > 0 ? reorderRowsByRequestedIds(rows, requestedIds) : rows;
    const assignedDeviceMap = await loadAssignedDevicesForEmails(orderedRows);
    const exportRows = orderedRows.map((row, index) => {
      const mapped = mapEmailRow(row, assignedDeviceMap, index + 1);
      return {
        No: mapped["No"],
        "Nama User": mapped["Nama User"],
        Email: mapped["Email"],
        Department: mapped["Department"],
        "Job Code": mapped["Job Code"],
        Location: mapped["Location"],
        "Jenis License": mapped["Jenis License"],
        Password: mapped["Password"],
        Keterangan: mapped["Keterangan"],
        Perangkat: mapped["Perangkat"],
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows, { skipHeader: false });
    worksheet["!cols"] = [
      { wch: 10 },
      { wch: 24 },
      { wch: 32 },
      { wch: 16 },
      { wch: 16 },
      { wch: 22 },
      { wch: 34 },
      { wch: 22 },
      { wch: 36 },
      { wch: 24 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Email");
    const fileBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="data-email.xlsx"');
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
