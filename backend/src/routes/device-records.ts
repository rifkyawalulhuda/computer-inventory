import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import multer from "multer";
import { type Request, type Response, Router } from "express";
import XLSX from "xlsx";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/auth";
import {
  sendDeviceFlowApprovedBastEmail,
  sendDeviceChangeRequestCompletedEmail,
  sendDeviceChangeRequestRejectedEmail,
  sendDeviceChangeRequestReviewEmail,
  sendDeviceFlowPendingEmail,
  sendDeviceFlowRejectedEmail,
  sendDeviceFlowSenderSignedBastEmail,
} from "../lib/mailer";
import { createBastPdfBuffer } from "../lib/bast-pdf";

export const deviceRecordRouter = Router();

type DeviceRecordPayload = {
  no: number | null;
  pomsSiteCodeSystem: string | null;
  jobCodeId: number;
  departmentJobCodeId: number | null;
  emailAccountId: string | null;
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

type DeviceFlowStatus =
  | "PENDING_CONFIRMATION"
  | "APPROVED"
  | "REJECTED";

type DeviceChangeRequestType =
  | "CHANGE_JOB_CODE"
  | "TRANSFER_SITE";

type DeviceChangeRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

type DeviceChangeRequestStep =
  | "ADMIN_REVIEW"
  | "TARGET_PIC_REVIEW"
  | "TARGET_PIC_ASSIGN_JOB_CODE"
  | "FINAL_ADMIN_REVIEW"
  | "COMPLETED"
  | "REJECTED";

type DeviceFlowActionPayload = {
  note: string | null;
  signatureDataUrl: string | null;
};

type DeviceChangeRequestCreatePayload = {
  requestType: DeviceChangeRequestType;
  requestedNote: string;
  requestedDepartmentJobCodeId: number | null;
  targetDepartmentId: number | null;
  targetPicUserId: string | null;
};

type DeviceChangeRequestAssignPayload = {
  targetDepartmentJobCodeId: number;
};

type NotificationHidePayload = {
  keys?: unknown;
};

type DeviceImportFileRow = {
  rowNumber: number;
  pomsSiteCodeSystem: string;
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
  keterangan: string;
  bitlockerKey: string;
};

type PreparedImportRow = {
  rowNumber: number;
  payload: DeviceRecordPayload;
};

type ImportEmailAccountOption = {
  id: string;
  departmentId: number;
  userName: string;
  email: string;
};

type HistoryFieldChange = {
  label: string;
  before: string | number | null | undefined;
  after: string | number | null | undefined;
};

type EditorRole = "admin" | "user";

const DEVICE_FLOW_STATUS_PENDING: DeviceFlowStatus = "PENDING_CONFIRMATION";
const DEVICE_FLOW_STATUS_APPROVED: DeviceFlowStatus = "APPROVED";
const DEVICE_FLOW_STATUS_REJECTED: DeviceFlowStatus = "REJECTED";
const DEVICE_CHANGE_REQUEST_TYPE_CHANGE_JOB_CODE: DeviceChangeRequestType = "CHANGE_JOB_CODE";
const DEVICE_CHANGE_REQUEST_TYPE_TRANSFER_SITE: DeviceChangeRequestType = "TRANSFER_SITE";
const DEVICE_CHANGE_REQUEST_STATUS_PENDING: DeviceChangeRequestStatus = "PENDING";
const DEVICE_CHANGE_REQUEST_STATUS_APPROVED: DeviceChangeRequestStatus = "APPROVED";
const DEVICE_CHANGE_REQUEST_STATUS_REJECTED: DeviceChangeRequestStatus = "REJECTED";
const DEVICE_CHANGE_REQUEST_STEP_ADMIN_REVIEW: DeviceChangeRequestStep = "ADMIN_REVIEW";
const DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_REVIEW: DeviceChangeRequestStep = "TARGET_PIC_REVIEW";
const DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_ASSIGN_JOB_CODE: DeviceChangeRequestStep = "TARGET_PIC_ASSIGN_JOB_CODE";
const DEVICE_CHANGE_REQUEST_STEP_FINAL_ADMIN_REVIEW: DeviceChangeRequestStep = "FINAL_ADMIN_REVIEW";
const DEVICE_CHANGE_REQUEST_STEP_COMPLETED: DeviceChangeRequestStep = "COMPLETED";
const DEVICE_CHANGE_REQUEST_STEP_REJECTED: DeviceChangeRequestStep = "REJECTED";
const DEVICE_FLOW_STATUSES = new Set<DeviceFlowStatus>([
  DEVICE_FLOW_STATUS_PENDING,
  DEVICE_FLOW_STATUS_APPROVED,
  DEVICE_FLOW_STATUS_REJECTED,
]);

const DEVICE_IMPORT_TEMPLATE_HEADERS = [
  "Site Code Sistem POMS",
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
  "Keterangan",
  "Bitlocker Key",
] as const;

const MAX_DEVICE_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
const DEVICE_IMPORT_DROPDOWN_MAX_ROWS = 1000;
const LEGACY_NO_LOCK_KEY = 8042026;
const DASHBOARD_EXPIRING_SOON_DAYS = 28;
const MAX_NOTIFICATION_HIDE_KEYS = 500;

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

function normalizeSiteCode(value: unknown, label: string): string | null {
  const text = cleanText(value).toUpperCase();
  if (!text) {
    return null;
  }

  if (!/^[A-Z]{1,5}$/.test(text)) {
    throw new Error(`${label} tidak valid.`);
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

function formatDateTime(date: Date | null | undefined): string {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseFlowDateValue(value: unknown): number | null {
  const text = cleanText(value);
  if (!text) {
    return null;
  }

  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getTime();
}

function parseFlowStatusFilters(rawValue: unknown): DeviceFlowStatus[] {
  const text = cleanText(rawValue);
  if (!text) {
    return [];
  }

  const statuses = text
    .split(",")
    .map((value) => cleanText(value).toUpperCase())
    .filter(Boolean) as DeviceFlowStatus[];

  const normalized = [...new Set(statuses)];
  const invalid = normalized.filter((status) => !DEVICE_FLOW_STATUSES.has(status));
  if (invalid.length > 0) {
    throw new Error(`Flow status tidak valid: ${invalid.join(", ")}.`);
  }

  return normalized;
}

function parseFlowActionPayload(payload: unknown, options?: { requireSignature?: boolean }): DeviceFlowActionPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload tidak valid.");
  }

  const body = payload as Record<string, unknown>;
  const note = toNullableText(body.note);
  const signatureDataUrl = toNullableText(body.signatureDataUrl);

  if (options?.requireSignature && !signatureDataUrl) {
    throw new Error("Tanda tangan digital wajib diisi.");
  }

  if (signatureDataUrl) {
    const isDataImage = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/i.test(signatureDataUrl);
    if (!isDataImage) {
      throw new Error("Format tanda tangan digital tidak valid.");
    }

    if (signatureDataUrl.length > 1_500_000) {
      throw new Error("Ukuran tanda tangan digital terlalu besar.");
    }
  }

  if (note && note.length > 1000) {
    throw new Error("Catatan maksimal 1000 karakter.");
  }

  return {
    note,
    signatureDataUrl,
  };
}

function parseDeviceChangeRequestCreatePayload(payload: unknown): DeviceChangeRequestCreatePayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload request perubahan tidak valid.");
  }

  const body = payload as Record<string, unknown>;
  const requestType = cleanText(body.requestType).toUpperCase() as DeviceChangeRequestType;
  const requestedNote = toNullableText(body.requestedNote);
  const requestedDepartmentJobCodeId = parseInteger(body.requestedDepartmentJobCodeId, "Job Code", { min: 1 });
  const targetDepartmentId = parseInteger(body.targetDepartmentId, "Department tujuan", { min: 1 });
  const targetPicUserId = toNullableText(body.targetPicUserId);

  if (!requestedNote) {
    throw new Error("Keterangan wajib diisi.");
  }

  if (requestedNote.length > 1000) {
    throw new Error("Keterangan maksimal 1000 karakter.");
  }

  if (
    requestType !== DEVICE_CHANGE_REQUEST_TYPE_CHANGE_JOB_CODE
    && requestType !== DEVICE_CHANGE_REQUEST_TYPE_TRANSFER_SITE
  ) {
    throw new Error("Kategori request tidak valid.");
  }

  if (requestType === DEVICE_CHANGE_REQUEST_TYPE_CHANGE_JOB_CODE && !requestedDepartmentJobCodeId) {
    throw new Error("Job Code baru wajib dipilih.");
  }

  if (requestType === DEVICE_CHANGE_REQUEST_TYPE_TRANSFER_SITE) {
    if (!targetDepartmentId) {
      throw new Error("Department tujuan wajib dipilih.");
    }

    if (!targetPicUserId) {
      throw new Error("PIC tujuan wajib dipilih.");
    }
  }

  return {
    requestType,
    requestedNote,
    requestedDepartmentJobCodeId,
    targetDepartmentId,
    targetPicUserId,
  };
}

function parseDeviceChangeRequestAssignPayload(payload: unknown): DeviceChangeRequestAssignPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload assign Job Code tidak valid.");
  }

  const body = payload as Record<string, unknown>;
  const targetDepartmentJobCodeId = parseInteger(body.targetDepartmentJobCodeId, "Job Code tujuan", { min: 1 });
  if (!targetDepartmentJobCodeId) {
    throw new Error("Job Code tujuan wajib dipilih.");
  }

  return { targetDepartmentJobCodeId };
}

function getDeviceChangeRequestTypeLabel(requestType: string | null | undefined): string {
  if (requestType === DEVICE_CHANGE_REQUEST_TYPE_CHANGE_JOB_CODE) {
    return "Ganti Job Code";
  }

  if (requestType === DEVICE_CHANGE_REQUEST_TYPE_TRANSFER_SITE) {
    return "Transfer Site";
  }

  return "Request Perubahan";
}

function getDeviceChangeRequestStepLabel(step: string | null | undefined): string {
  if (step === DEVICE_CHANGE_REQUEST_STEP_ADMIN_REVIEW) {
    return "Admin Review";
  }

  if (step === DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_REVIEW) {
    return "Review PIC Tujuan";
  }

  if (step === DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_ASSIGN_JOB_CODE) {
    return "PIC Pilih Job Code";
  }

  if (step === DEVICE_CHANGE_REQUEST_STEP_FINAL_ADMIN_REVIEW) {
    return "Final Admin Review";
  }

  if (step === DEVICE_CHANGE_REQUEST_STEP_COMPLETED) {
    return "Completed";
  }

  if (step === DEVICE_CHANGE_REQUEST_STEP_REJECTED) {
    return "Rejected";
  }

  return "-";
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

function hasExpiredDaysLeaseValue(value: number | string | null | undefined): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value) && value <= 0;
  }

  const text = cleanText(value);
  if (!text) {
    return false;
  }

  if (text.toUpperCase() === "TODAY") {
    return true;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed <= 0;
}

function isDateOnOrBeforeToday(date: Date | null | undefined): boolean {
  if (!date) {
    return false;
  }

  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return getUtcDateStartMs(date) <= todayMs;
}

function normalizeLeaseStatusText(value: unknown): string {
  return cleanText(value).replaceAll("_", " ").toUpperCase();
}

function isBackToKddiLeaseStatus(value: unknown): boolean {
  return normalizeLeaseStatusText(value) === "BACK TO KDDI";
}

function resolveLeaseStatus(
  leaseStatus: string | null | undefined,
  daysLease: number | string | null | undefined,
  endDate: Date | null | undefined,
): string | null {
  if (isBackToKddiLeaseStatus(leaseStatus)) {
    return "Back To KDDI";
  }

  if (hasExpiredDaysLeaseValue(daysLease) || isDateOnOrBeforeToday(endDate)) {
    return "EXPIRED";
  }

  return toNullableText(leaseStatus);
}

function parsePayload(payload: unknown): DeviceRecordPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload tidak valid.");
  }

  const body = payload as Record<string, unknown>;

  const no = null;
  const pomsSiteCodeSystem = normalizeSiteCode(body.pomsSiteCodeSystem, "Site Code Sistem POMS");
  const jobCodeId = Number(body.jobCodeId);
  const parsedDepartmentJobCodeId = parseInteger(body.departmentJobCodeId, "Job Code", { min: 1 });
  const emailAccountId = toNullableText(body.emailAccountId);
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

  const normalizedLeaseStatus = resolveLeaseStatus(leaseStatus, daysLease, endDate);

  return {
    no,
    pomsSiteCodeSystem,
    jobCodeId,
    departmentJobCodeId,
    emailAccountId,
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
    leaseStatus: normalizedLeaseStatus,
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

const ADMIN_DIRECT_DEVICE_EDIT_NOTIFICATION_PREFIX = "ADMIN_DIRECT_DEVICE_EDIT_NOTIFY";
const ADMIN_EMAIL_CREATE_NOTIFICATION_PREFIX = "ADMIN_EMAIL_CREATE_NOTIFY";
const ADMIN_EMAIL_NOTIFICATION_TYPE_CREATED = "ADMIN_CREATED";
const ADMIN_EMAIL_NOTIFICATION_TYPE_DELETED = "ADMIN_DELETED";

type AdminDirectDeviceEditRecipientRole = "SOURCE" | "TARGET" | "SOURCE_AND_TARGET";

type AdminDirectDeviceEditNotificationEntry = {
  eventAt: string;
  recipientUserId: string;
  recipientRole: AdminDirectDeviceEditRecipientRole;
  actorName: string;
  serialNo: string;
  hostName: string;
  category: string;
  model: string;
  fromDepartment: string;
  fromJobCode: string;
  fromPicName: string;
  fromPomsSiteCodeSystem: string;
  toDepartment: string;
  toJobCode: string;
  toPicName: string;
  toPomsSiteCodeSystem: string;
};

type AdminEmailCreateNotificationEntry = {
  eventAt: string;
  recipientUserId: string;
  actorName: string;
  department: string;
  jobCode: string;
  userName: string;
  email: string;
  licenseType: string;
  notificationType: string;
};

function buildAdminDirectDeviceEditNotificationMarker(entry: Omit<AdminDirectDeviceEditNotificationEntry, "eventAt">): string {
  const parts: Array<[string, string]> = [
    ["recipientUserId", entry.recipientUserId],
    ["recipientRole", entry.recipientRole],
    ["actorName", entry.actorName],
    ["serialNo", entry.serialNo],
    ["hostName", entry.hostName],
    ["category", entry.category],
    ["model", entry.model],
    ["fromDepartment", entry.fromDepartment],
    ["fromJobCode", entry.fromJobCode],
    ["fromPicName", entry.fromPicName],
    ["fromPomsSiteCodeSystem", entry.fromPomsSiteCodeSystem],
    ["toDepartment", entry.toDepartment],
    ["toJobCode", entry.toJobCode],
    ["toPicName", entry.toPicName],
    ["toPomsSiteCodeSystem", entry.toPomsSiteCodeSystem],
  ];

  return `${ADMIN_DIRECT_DEVICE_EDIT_NOTIFICATION_PREFIX}|${parts
    .map(([key, value]) => `${key}=${encodeURIComponent(cleanText(value))}`)
    .join("|")}`;
}

function parseAdminDirectDeviceEditNotifications(
  historyLog: string | null | undefined,
  recipientUserId: string,
): AdminDirectDeviceEditNotificationEntry[] {
  const normalizedRecipientUserId = cleanText(recipientUserId);
  if (!normalizedRecipientUserId) {
    return [];
  }

  return String(historyLog || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(.+?)\]\s+ADMIN_DIRECT_DEVICE_EDIT_NOTIFY\|(.*)$/);
      if (!match) {
        return null;
      }

      const eventAt = cleanText(match[1]);
      const rawPayload = cleanText(match[2]);
      const data = rawPayload.split("|").reduce<Record<string, string>>((accumulator, segment) => {
        const separatorIndex = segment.indexOf("=");
        if (separatorIndex < 1) {
          return accumulator;
        }

        const key = cleanText(segment.slice(0, separatorIndex));
        const rawValue = segment.slice(separatorIndex + 1);
        accumulator[key] = decodeURIComponent(rawValue);
        return accumulator;
      }, {});

      if (cleanText(data.recipientUserId) !== normalizedRecipientUserId) {
        return null;
      }

      return {
        eventAt,
        recipientUserId: normalizedRecipientUserId,
        recipientRole: (cleanText(data.recipientRole) as AdminDirectDeviceEditRecipientRole) || "TARGET",
        actorName: cleanText(data.actorName),
        serialNo: cleanText(data.serialNo),
        hostName: cleanText(data.hostName),
        category: cleanText(data.category),
        model: cleanText(data.model),
        fromDepartment: cleanText(data.fromDepartment),
        fromJobCode: cleanText(data.fromJobCode),
        fromPicName: cleanText(data.fromPicName),
        fromPomsSiteCodeSystem: cleanText(data.fromPomsSiteCodeSystem),
        toDepartment: cleanText(data.toDepartment),
        toJobCode: cleanText(data.toJobCode),
        toPicName: cleanText(data.toPicName),
        toPomsSiteCodeSystem: cleanText(data.toPomsSiteCodeSystem),
      } satisfies AdminDirectDeviceEditNotificationEntry;
    })
    .filter((entry): entry is AdminDirectDeviceEditNotificationEntry => Boolean(entry));
}

function parseAdminEmailCreateNotifications(
  historyLog: string | null | undefined,
  recipientUserId: string,
): AdminEmailCreateNotificationEntry[] {
  const normalizedRecipientUserId = cleanText(recipientUserId);
  if (!normalizedRecipientUserId) {
    return [];
  }

  return String(historyLog || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(.+?)\]\s+ADMIN_EMAIL_CREATE_NOTIFY\|(.*)$/);
      if (!match) {
        return null;
      }

      const eventAt = cleanText(match[1]);
      const rawPayload = cleanText(match[2]);
      const data = rawPayload.split("|").reduce<Record<string, string>>((accumulator, segment) => {
        const separatorIndex = segment.indexOf("=");
        if (separatorIndex < 1) {
          return accumulator;
        }

        const key = cleanText(segment.slice(0, separatorIndex));
        const rawValue = segment.slice(separatorIndex + 1);
        accumulator[key] = decodeURIComponent(rawValue);
        return accumulator;
      }, {});

      if (cleanText(data.recipientUserId) !== normalizedRecipientUserId) {
        return null;
      }

      return {
        eventAt,
        recipientUserId: normalizedRecipientUserId,
        actorName: cleanText(data.actorName),
        department: cleanText(data.department),
        jobCode: cleanText(data.jobCode),
        userName: cleanText(data.userName),
        email: cleanText(data.email),
        licenseType: cleanText(data.licenseType),
        notificationType: ADMIN_EMAIL_NOTIFICATION_TYPE_CREATED,
      } satisfies AdminEmailCreateNotificationEntry;
    })
    .filter((entry): entry is AdminEmailCreateNotificationEntry => Boolean(entry));
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

async function resolveDataScope(req: Request): Promise<{ editorRole: EditorRole; userJobCodeId: number | null; userId: string | null }> {
  const editorRole = parseEditorRole(req);
  const userId = cleanText(req.authUser?.id) || null;
  if (editorRole === "admin") {
    return { editorRole, userJobCodeId: null, userId };
  }

  const userJobCodeId = await getAssignedJobCodeId(req);
  if (!userJobCodeId) {
    throw new Error("ROLE_USER_JOB_CODE_NOT_FOUND");
  }

  return { editorRole, userJobCodeId, userId };
}

function requireAuthenticatedUserId(req: Request): string {
  const userId = cleanText(req.authUser?.id);
  if (!userId) {
    throw new Error("AUTH_USER_NOT_FOUND");
  }

  return userId;
}

function normalizeNotificationKeys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedKeys: string[] = [];
  const seenKeys = new Set<string>();

  value.forEach((entry) => {
    const key = cleanText(entry);
    if (!key || key.length > 255 || seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    normalizedKeys.push(key);
  });

  return normalizedKeys.slice(0, MAX_NOTIFICATION_HIDE_KEYS);
}

async function getHiddenNotificationKeys(userId: string): Promise<string[]> {
  const normalizedUserId = cleanText(userId);
  if (!normalizedUserId) {
    return [];
  }

  const rows = await prisma.$queryRaw<Array<{ notification_key: string | null }>>(Prisma.sql`
    SELECT "notification_key"
    FROM "user_hidden_notifications"
    WHERE "user_id" = ${normalizedUserId}
  `);

  return rows
    .map((row) => cleanText(row.notification_key))
    .filter(Boolean);
}

async function hideNotificationsForUser(userId: string, keys: string[]): Promise<string[]> {
  const normalizedUserId = cleanText(userId);
  const normalizedKeys = normalizeNotificationKeys(keys);
  if (!normalizedUserId || normalizedKeys.length === 0) {
    return [];
  }

  const valueTuples = Prisma.join(
    normalizedKeys.map((notificationKey) => Prisma.sql`(${randomUUID()}, ${normalizedUserId}, ${notificationKey}, NOW())`)
  );

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "user_hidden_notifications" ("id", "user_id", "notification_key", "created_at")
    VALUES ${valueTuples}
    ON CONFLICT ("user_id", "notification_key") DO NOTHING
  `);

  return normalizedKeys;
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
  changeRequests: {
    where: { status: DEVICE_CHANGE_REQUEST_STATUS_PENDING },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      requestType: true,
      status: true,
      currentStep: true,
      requestedNote: true,
      latestRejectReason: true,
      createdAt: true,
    },
  },
} as const;

type MappedDeviceRow = {
  id: string;
  legacyNo: number | null;
  pomsSiteCodeSystem: string | null;
  emailAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
  flowStatus: string;
  flowAssignedPicUserId: string | null;
  flowSubmittedByUserId: string | null;
  flowApprovedByUserId: string | null;
  flowApprovedAt: Date | null;
  flowRejectedByUserId: string | null;
  flowRejectedAt: Date | null;
  flowRejectNote: string | null;
  flowRecipientSignature: string | null;
  flowSenderSignature: string | null;
  flowSenderSignedByUserId: string | null;
  flowSenderSignedAt: Date | null;
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
  changeRequests: Array<{
    id: string;
    requestType: string;
    status: string;
    currentStep: string;
    requestedNote: string;
    latestRejectReason: string | null;
    createdAt: Date;
  }>;
};

function mapDeviceToExcelRecord(row: MappedDeviceRow, fallbackNo?: number) {
  const latestLease = row.leaseContracts[0] ?? null;
  const pendingChangeRequest = row.changeRequests[0] ?? null;
  const calculatedDaysLease = calculateDaysLease(
    latestLease?.startDate ?? null,
    latestLease?.endDate ?? null,
  );
  const displayDaysLease = calculatedDaysLease ?? latestLease?.daysLease ?? "";
  const displayLeaseStatus = resolveLeaseStatus(
    latestLease?.leaseStatus ?? null,
    displayDaysLease,
    latestLease?.endDate ?? null,
  ) ?? "";

  return {
    id: row.id,
    emailAccountId: row.emailAccountId ?? "",
    NO: row.legacyNo ?? fallbackNo ?? "",
    "Site Code Sistem POMS": row.pomsSiteCodeSystem ?? "",
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
    "Lease Status": displayLeaseStatus,
    "Hystory Log": latestLease?.historyLog ?? "",
    Keterangan: row.notes ?? "",
    "Bitlocker Key": row.bitlockerKey ?? "",
    "Has Pending Change Request": pendingChangeRequest ? "YES" : "NO",
    "Pending Change Request ID": pendingChangeRequest?.id ?? "",
    "Pending Change Request Type": pendingChangeRequest
      ? getDeviceChangeRequestTypeLabel(pendingChangeRequest.requestType)
      : "",
    "Pending Change Request Step": pendingChangeRequest
      ? getDeviceChangeRequestStepLabel(pendingChangeRequest.currentStep)
      : "",
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

function mapDeviceToFlowRecord(
  row: MappedDeviceRow,
  fallbackNo?: number,
  userMetaById?: Map<string, { name: string; departmentCode: string }>,
) {
  const base = mapDeviceToExcelRecord(row, fallbackNo);
  const approvedByMeta = row.flowApprovedByUserId
    ? userMetaById?.get(row.flowApprovedByUserId) ?? { name: row.flowApprovedByUserId, departmentCode: "" }
    : { name: "", departmentCode: "" };
  const rejectedByMeta = row.flowRejectedByUserId
    ? userMetaById?.get(row.flowRejectedByUserId) ?? { name: row.flowRejectedByUserId, departmentCode: "" }
    : { name: "", departmentCode: "" };
  const assignedPicMeta = row.flowAssignedPicUserId
    ? userMetaById?.get(row.flowAssignedPicUserId) ?? { name: row.flowAssignedPicUserId, departmentCode: "" }
    : { name: "", departmentCode: "" };
  const senderSignedByMeta = row.flowSenderSignedByUserId
    ? userMetaById?.get(row.flowSenderSignedByUserId) ?? { name: row.flowSenderSignedByUserId, departmentCode: "" }
    : { name: "", departmentCode: "" };
  const submittedByMeta = row.flowSubmittedByUserId
    ? userMetaById?.get(row.flowSubmittedByUserId) ?? { name: row.flowSubmittedByUserId, departmentCode: "" }
    : { name: "", departmentCode: "" };

  const mapped = {
    ...base,
    "Department": submittedByMeta.departmentCode || base["Department"],
    "PIC Name": submittedByMeta.name || base["PIC Name"],
    flowItemType: "DEVICE_FLOW",
    requestType: "DEVICE_FLOW",
    requestTypeLabel: "Approval Perangkat",
    currentStep: cleanText(row.flowStatus || DEVICE_FLOW_STATUS_APPROVED),
    currentStepLabel: cleanText(row.flowStatus || DEVICE_FLOW_STATUS_APPROVED),
    isSignatureFlow: true,
    "Flow Status": cleanText(row.flowStatus || DEVICE_FLOW_STATUS_APPROVED),
    availableActions: [] as string[],
    "Created At": formatDateTime(row.createdAt),
    "Flow Assigned PIC User ID": row.flowAssignedPicUserId ?? "",
    "Flow Submitted By User ID": row.flowSubmittedByUserId ?? "",
    "Flow Submitted By": submittedByMeta.name,
    "Flow Submitted By Department": submittedByMeta.departmentCode,
    "Flow Assigned PIC Name": assignedPicMeta.name,
    "Flow Assigned PIC Department": assignedPicMeta.departmentCode,
    "Flow Approved By User ID": row.flowApprovedByUserId ?? "",
    "Flow Approved By": approvedByMeta.name,
    "Flow Approved Department": approvedByMeta.departmentCode,
    "Flow Approved At": formatDateTime(row.flowApprovedAt),
    "Flow Rejected By User ID": row.flowRejectedByUserId ?? "",
    "Flow Rejected By": rejectedByMeta.name,
    "Flow Rejected Department": rejectedByMeta.departmentCode,
    "Flow Rejected At": formatDateTime(row.flowRejectedAt),
    "Flow Reject Note": row.flowRejectNote ?? "",
    "Flow Recipient Signature": row.flowRecipientSignature ?? "",
    "Flow Sender Signature": row.flowSenderSignature ?? "",
    "Flow Sender Signed By User ID": row.flowSenderSignedByUserId ?? "",
    "Flow Sender Signed By": senderSignedByMeta.name,
    "Flow Sender Signed By Department": senderSignedByMeta.departmentCode,
    "Flow Sender Signed At": formatDateTime(row.flowSenderSignedAt),
  };

  mapped.availableActions = buildDeviceFlowAvailableActions(mapped);
  return mapped;
}

function mapFlowRowsWithResolvedNo(
  rows: MappedDeviceRow[],
  userMetaById?: Map<string, { name: string; departmentCode: string }>,
) {
  let nextFallbackNo = rows.reduce((maxNo, row) => {
    const value = typeof row.legacyNo === "number" && Number.isFinite(row.legacyNo) ? row.legacyNo : 0;
    return value > maxNo ? value : maxNo;
  }, 0);

  return rows.map((row) => {
    if (typeof row.legacyNo === "number" && Number.isFinite(row.legacyNo) && row.legacyNo > 0) {
      return mapDeviceToFlowRecord(row, undefined, userMetaById);
    }

    nextFallbackNo += 1;
    return mapDeviceToFlowRecord(row, nextFallbackNo, userMetaById);
  });
}

const deviceChangeRequestInclude = {
  device: {
    include: deviceRecordInclude,
  },
  requestedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
      jobCode: {
        select: {
          code: true,
        },
      },
    },
  },
  currentReviewerUser: {
    select: {
      id: true,
      name: true,
      email: true,
      jobCode: {
        select: {
          code: true,
        },
      },
    },
  },
  targetPicUser: {
    select: {
      id: true,
      name: true,
      email: true,
      jobCode: {
        select: {
          code: true,
        },
      },
    },
  },
  requestedByDepartment: {
    select: {
      id: true,
      code: true,
      siteName: true,
    },
  },
  targetDepartment: {
    select: {
      id: true,
      code: true,
      siteName: true,
    },
  },
  requestedDepartmentJobCode: {
    select: {
      id: true,
      code: true,
    },
  },
  targetDepartmentJobCode: {
    select: {
      id: true,
      code: true,
    },
  },
  events: {
    orderBy: {
      createdAt: "asc" as const,
    },
    select: {
      id: true,
      action: true,
      note: true,
      createdAt: true,
      metadataJson: true,
      actorUser: {
        select: {
          id: true,
          name: true,
          jobCode: {
            select: {
              code: true,
            },
          },
        },
      },
    },
  },
} as const;

type MappedDeviceChangeRequestRow = {
  id: string;
  requestType: string;
  status: string;
  currentStep: string;
  requestedByUserId: string;
  requestedByDepartmentId: number | null;
  requestedNote: string;
  requestedDepartmentJobCodeId: number | null;
  targetDepartmentId: number | null;
  targetPicUserId: string | null;
  targetDepartmentJobCodeId: number | null;
  latestRejectReason: string | null;
  currentReviewerUserId: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  device: MappedDeviceRow;
  requestedByUser: {
    id: string;
    name: string;
    email: string;
    jobCode: { code: string } | null;
  };
  currentReviewerUser: {
    id: string;
    name: string;
    email: string;
    jobCode: { code: string } | null;
  } | null;
  targetPicUser: {
    id: string;
    name: string;
    email: string;
    jobCode: { code: string } | null;
  } | null;
  requestedByDepartment: {
    id: number;
    code: string;
    siteName: string;
  } | null;
  targetDepartment: {
    id: number;
    code: string;
    siteName: string;
  } | null;
  requestedDepartmentJobCode: {
    id: number;
    code: string;
  } | null;
  targetDepartmentJobCode: {
    id: number;
    code: string;
  } | null;
  events: Array<{
    id: string;
    action: string;
    note: string | null;
    createdAt: Date;
    metadataJson: Prisma.JsonValue | null;
    actorUser: {
      id: string;
      name: string;
      jobCode: { code: string } | null;
    } | null;
  }>;
};

function buildDeviceFlowAvailableActions(row: ReturnType<typeof mapDeviceToFlowRecord>): string[] {
  const actions = ["view"];
  const status = cleanText(row["Flow Status"]).toUpperCase();
  if (status === DEVICE_FLOW_STATUS_PENDING) {
    actions.push("approve", "reject");
  }
  if (status === DEVICE_FLOW_STATUS_REJECTED) {
    actions.push("resubmit");
  }
  if (status === DEVICE_FLOW_STATUS_APPROVED) {
    actions.push("sender-sign", "print-bast");
  }
  return actions;
}

function buildDeviceChangeRequestAvailableActions(row: MappedDeviceChangeRequestRow): string[] {
  const actions = ["view"];
  if (row.status !== DEVICE_CHANGE_REQUEST_STATUS_PENDING) {
    return actions;
  }

  if (
    row.currentStep === DEVICE_CHANGE_REQUEST_STEP_ADMIN_REVIEW
    || row.currentStep === DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_REVIEW
    || row.currentStep === DEVICE_CHANGE_REQUEST_STEP_FINAL_ADMIN_REVIEW
  ) {
    actions.push("approve", "reject");
  }

  if (row.currentStep === DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_ASSIGN_JOB_CODE) {
    actions.push("assign-job-code");
  }

  return actions;
}

function mapChangeRequestToFlowRecord(row: MappedDeviceChangeRequestRow, fallbackNo?: number) {
  const base = mapDeviceToExcelRecord(row.device, fallbackNo);
  const eventLines = row.events.map((event) => {
    const actorName = cleanText(event.actorUser?.name) || "System";
    const note = cleanText(event.note);
    const suffix = note ? ` - ${note}` : "";
    return `[${formatDateTime(event.createdAt)}] ${event.action} oleh ${actorName}${suffix}`;
  });

  return {
    ...base,
    "Department": row.requestedByDepartment?.code ?? base["Department"],
    "PIC Name": row.requestedByUser?.name ?? base["PIC Name"],
    id: row.id,
    flowItemType: "DEVICE_CHANGE_REQUEST",
    requestType: row.requestType,
    requestTypeLabel: getDeviceChangeRequestTypeLabel(row.requestType),
    currentStep: row.currentStep,
    currentStepLabel: getDeviceChangeRequestStepLabel(row.currentStep),
    isSignatureFlow: false,
    availableActions: buildDeviceChangeRequestAvailableActions(row),
    "Created At": formatDateTime(row.createdAt),
    "Flow Status": cleanText(row.status || DEVICE_CHANGE_REQUEST_STATUS_PENDING),
    "Flow Approved At": formatDateTime(row.approvedAt),
    "Flow Reject Note": row.latestRejectReason ?? "",
    "Flow Submitted By User ID": row.requestedByUserId,
    "Flow Submitted By": row.requestedByUser?.name ?? "",
    "Flow Submitted By Department": cleanText(row.requestedByUser?.jobCode?.code),
    "Flow Assigned PIC User ID": row.currentReviewerUserId ?? "",
    "Flow Assigned PIC Name": row.currentReviewerUser?.name ?? "",
    "Flow Assigned PIC Department": cleanText(row.currentReviewerUser?.jobCode?.code),
    "Flow Approved By User ID": "",
    "Flow Approved By": "",
    "Flow Approved Department": "",
    "Flow Rejected By User ID": "",
    "Flow Rejected By": "",
    "Flow Rejected Department": "",
    "Flow Rejected At": formatDateTime(row.rejectedAt),
    "Flow Recipient Signature": "",
    "Flow Sender Signature": "",
    "Flow Sender Signed By User ID": "",
    "Flow Sender Signed By": "",
    "Flow Sender Signed By Department": "",
    "Flow Sender Signed At": "",
    "Request Type": getDeviceChangeRequestTypeLabel(row.requestType),
    "Current Step": getDeviceChangeRequestStepLabel(row.currentStep),
    "Requested By": row.requestedByUser?.name ?? "",
    "Requested By Email": row.requestedByUser?.email ?? "",
    "Requested Department": row.requestedByDepartment?.code ?? row.device.jobCode?.code ?? "",
    "Requested Job Code": row.requestedDepartmentJobCode?.code ?? "",
    "Requested Note": row.requestedNote,
    "Target Department": row.targetDepartment?.code ?? "",
    "Target Department Name": row.targetDepartment?.siteName ?? "",
    "Target PIC User ID": row.targetPicUserId ?? "",
    "Target PIC Name": row.targetPicUser?.name ?? "",
    "Target PIC Email": row.targetPicUser?.email ?? "",
    "Target Job Code": row.targetDepartmentJobCode?.code ?? "",
    "Latest Reject Reason": row.latestRejectReason ?? "",
    "History Log": eventLines.join("\n"),
    "Hystory Log": eventLines.join("\n"),
  };
}

function mapChangeRequestRowsWithResolvedNo(rows: MappedDeviceChangeRequestRow[]) {
  let nextFallbackNo = rows.reduce((maxNo, row) => {
    const value = typeof row.device?.legacyNo === "number" && Number.isFinite(row.device.legacyNo)
      ? row.device.legacyNo
      : 0;
    return value > maxNo ? value : maxNo;
  }, 0);

  return rows.map((row) => {
    if (
      typeof row.device?.legacyNo === "number"
      && Number.isFinite(row.device.legacyNo)
      && row.device.legacyNo > 0
    ) {
      return mapChangeRequestToFlowRecord(row);
    }

    nextFallbackNo += 1;
    return mapChangeRequestToFlowRecord(row, nextFallbackNo);
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

function deriveImportLeaseStatusFromDates(startDateValue: string, endDateValue: string): string {
  const startDate = parseDate(startDateValue, "Start Date");
  const endDate = parseDate(endDateValue, "End Date");
  const daysLease = calculateDaysLease(startDate, endDate);
  return resolveLeaseStatus("ACTIVE", daysLease, endDate) ?? "ACTIVE";
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
      pomsSiteCodeSystem: cleanText(values[0]).toUpperCase(),
      jobCode: cleanText(values[1]).toUpperCase(),
      departmentJobCode: cleanText(values[2]).toUpperCase(),
      picName: cleanText(values[3]),
      serialNo: cleanText(values[4]),
      category: cleanText(values[5]),
      model: cleanText(values[6]),
      hostName: cleanText(values[7]),
      userName: cleanText(values[8]),
      userEmail: cleanText(values[9]),
      location: cleanText(values[10]),
      ipList: cleanText(values[11]),
      startDate: normalizeImportDateValue(values[12]),
      endDate: normalizeImportDateValue(values[13]),
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
  workbook.calcProperties.fullCalcOnLoad = true;
  const templateSheet = workbook.addWorksheet("Template");
  const instructionSheet = workbook.addWorksheet("Instruksi");
  const referenceSheet = workbook.addWorksheet("Referensi");

  const [departments, picUsers, emailAccounts] = await Promise.all([
    prisma.department.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
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
        jobCodeId: true,
      },
    }),
    prisma.emailAccount.findMany({
      orderBy: [{ userName: "asc" }, { email: "asc" }],
      select: {
        id: true,
        departmentId: true,
        userName: true,
        email: true,
      },
    }),
  ]);

  const firstDepartment = departments[0] ?? null;
  const samplePicUser = firstDepartment
    ? picUsers.find((user) => user.jobCodeId === firstDepartment.id) ?? null
    : picUsers[0] ?? null;
  const sampleEmailAccount = firstDepartment
    ? emailAccounts.find((row) => row.departmentId === firstDepartment.id) ?? null
    : emailAccounts[0] ?? null;

  templateSheet.addRow([...DEVICE_IMPORT_TEMPLATE_HEADERS]);
  templateSheet.addRow([
    firstDepartment?.code ?? "",
    firstDepartment?.code ?? "",
    firstDepartment?.jobCodes?.[0]?.code ?? "",
    samplePicUser ? `${samplePicUser.name} (${samplePicUser.email})` : "",
    "SN-001",
    "Laptop",
    "DELL 5420",
    "L-ID-22-030",
    sampleEmailAccount?.userName ?? "",
    "",
    "Cikarang",
    "192.168.1.10",
    "2026-02-01",
    "2026-12-31",
    "Data awal",
    "",
  ]);

  templateSheet.columns = [
    { width: 18 },
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
    { width: 24 },
    { width: 24 },
  ];

  const headerRow = templateSheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  referenceSheet.columns = [
    { width: 28 },
    { width: 28 },
    { width: 24 },
    { width: 42 },
    { width: 16 },
    { width: 16 },
    { width: 28 },
    { width: 40 },
    { width: 28 },
  ];

  referenceSheet.getCell("A1").value = "Site Code Sistem POMS";
  referenceSheet.getCell("B1").value = "Department";
  referenceSheet.getCell("C1").value = "Job Code";
  referenceSheet.getCell("D1").value = "PIC Name";
  referenceSheet.getCell("E1").value = "Category";
  referenceSheet.getCell("F1").value = "User Name";
  referenceSheet.getCell("G1").value = "Department|User Name";
  referenceSheet.getCell("H1").value = "User Email";

  const categoryOptions = ["Laptop", "Desktop"];

  const jobCodeValues = departments.length > 0 ? departments.map((row) => row.code) : [""];
  const departmentJobCodeValues = departments.length > 0
    ? [...new Set(departments.flatMap((row) => row.jobCodes.map((item) => item.code)))]
    : [""];
  const picValues = picUsers.length > 0
    ? picUsers.map((user) => `${user.name} (${user.email})`)
    : [""];
  const userNameValues = emailAccounts.length > 0
    ? [...new Set(emailAccounts.map((row) => cleanText(row.userName)).filter(Boolean))]
    : [""];

  const fillColumn = (column: "A" | "B" | "C" | "D" | "E" | "F", values: string[]) => {
    values.forEach((value, index) => {
      referenceSheet.getCell(`${column}${index + 2}`).value = value;
    });
  };

  fillColumn("A", jobCodeValues);
  fillColumn("B", jobCodeValues);
  fillColumn("C", departmentJobCodeValues);
  fillColumn("D", picValues);
  fillColumn("E", categoryOptions);
  fillColumn("F", userNameValues);

  emailAccounts.forEach((row, index) => {
    const departmentCode = departments.find((department) => department.id === row.departmentId)?.code ?? "";
    referenceSheet.getCell(`G${index + 2}`).value = `${cleanText(departmentCode).toUpperCase()}|${cleanText(row.userName)}`;
    referenceSheet.getCell(`H${index + 2}`).value = cleanText(row.email).toLowerCase();
  });

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
  const userNameLastRow = Math.max(2, userNameValues.length + 1);
  const emailAccountLastRow = Math.max(2, emailAccounts.length + 1);

  addListValidation(1, `=Referensi!$A$2:$A$${jobCodeLastRow}`, true, "Jika diisi, Site Code Sistem POMS harus dipilih dari dropdown.");
  addListValidation(2, `=Referensi!$B$2:$B$${jobCodeLastRow}`, false, "Department wajib dipilih dari dropdown.");
  addListValidation(3, `=Referensi!$C$2:$C$${departmentJobCodeLastRow}`, true, "Jika diisi, Job Code harus dipilih dari dropdown.");
  addListValidation(4, `=Referensi!$D$2:$D$${picLastRow}`, false, "PIC Name wajib dipilih dari dropdown.");
  addListValidation(9, `=Referensi!$F$2:$F$${userNameLastRow}`, true, "Jika diisi, User Name harus dipilih dari dropdown Data Email.");
  addListValidation(6, "=Referensi!$E$2:$E$3");

  for (let row = 2; row <= DEVICE_IMPORT_DROPDOWN_MAX_ROWS; row += 1) {
    templateSheet.getCell(row, 10).value = {
      formula: `IF(OR($B${row}="",$I${row}=""),"",IFERROR(VLOOKUP($B${row}&"|"&$I${row},Referensi!$G$2:$H$${emailAccountLastRow},2,FALSE),""))`,
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

    templateSheet.getCell(row, 14).dataValidation = {
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
    ["3. Kolom dropdown: Site Code Sistem POMS, Department, Job Code, PIC Name, Category, User Name."],
    ["4. Department dan PIC Name wajib diisi serta harus terdaftar di master."],
    ["5. Site Code Sistem POMS opsional dan diambil dari master Site Code, tetapi tidak terikat ke Department pada baris yang sama."],
    ["6. Job Code opsional. Jika diisi, Job Code harus sesuai dengan Department pada baris yang sama."],
    ["7. PIC Name harus user yang terdaftar di Master User."],
    ["8. User Name bersumber dari Data Email dan hanya valid jika terdaftar pada Department yang sama."],
    ["9. Kolom User Email akan terisi otomatis di template saat Department dan User Name cocok dengan data pada sheet referensi tersembunyi."],
    ["10. Jika User Name diisi tetapi Department tersebut tidak memiliki Data Email yang cocok, baris import akan gagal."],
    ["11. Jika kolom User Email kosong atau formula diubah manual, backend tetap akan memvalidasi User Name dan mengisi email sesuai master Data Email saat import."],
    ["12. Format tanggal yang disarankan: YYYY-MM-DD (contoh 2026-02-28)."],
    ["13. Lease Status tidak perlu diisi di template. Sistem akan menghitung otomatis dari Start Date dan End Date saat import."],
    ["14. Kolom opsional: Site Code Sistem POMS, Job Code, User Name, User Email, Location, IP List, Keterangan."],
    ["15. Jika Serial No sudah ada, data akan diupdate. Jika belum ada, data baru dibuat."],
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

function resolveDeviceEmailFromImport(
  emailAccounts: ImportEmailAccountOption[],
  departmentCode: string,
  userNameReference: string,
  userEmailReference: string,
): {
  emailAccountId: string | null;
  userName: string | null;
  userEmail: string | null;
} {
  const normalizedUserName = cleanText(userNameReference);
  const normalizedUserEmail = cleanText(userEmailReference).toLowerCase();

  if (!normalizedUserName && !normalizedUserEmail) {
    return {
      emailAccountId: null,
      userName: null,
      userEmail: null,
    };
  }

  if (!normalizedUserName && normalizedUserEmail) {
    throw new Error("User Name wajib diisi jika User Email diisi.");
  }

  if (!emailAccounts.length) {
    throw new Error(`Department "${departmentCode}" belum memiliki Data Email untuk dipilih sebagai User Name.`);
  }

  const matchesByUserName = emailAccounts.filter((row) => (
    cleanText(row.userName).toLowerCase() === normalizedUserName.toLowerCase()
  ));

  if (!matchesByUserName.length) {
    throw new Error("User Name tidak terdaftar pada Data Email untuk Department ini.");
  }

  if (normalizedUserEmail) {
    const matchedByEmail = matchesByUserName.find((row) => cleanText(row.email).toLowerCase() === normalizedUserEmail);
    if (!matchedByEmail) {
      throw new Error("User Email tidak sesuai dengan User Name pada Data Email.");
    }

    return {
      emailAccountId: matchedByEmail.id,
      userName: cleanText(matchedByEmail.userName) || null,
      userEmail: cleanText(matchedByEmail.email).toLowerCase() || null,
    };
  }

  if (matchesByUserName.length > 1) {
    throw new Error("User Name duplikat pada Data Email untuk Department ini. Isi User Email sesuai master agar spesifik.");
  }

  return {
    emailAccountId: matchesByUserName[0].id,
    userName: cleanText(matchesByUserName[0].userName) || null,
    userEmail: cleanText(matchesByUserName[0].email).toLowerCase() || null,
  };
}

async function prepareDeviceImportRows(rows: DeviceImportFileRow[]): Promise<PreparedImportRow[]> {
  const uniqueDepartmentCodes = [...new Set(
    rows.flatMap((row) => [row.pomsSiteCodeSystem, row.jobCode].map((value) => cleanText(value).toUpperCase()).filter(Boolean))
  )];

  const departments = await prisma.department.findMany({
    where: {
      code: {
        in: uniqueDepartmentCodes,
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

  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      departmentId: {
        in: departments.map((row) => row.id),
      },
    },
    orderBy: [{ userName: "asc" }, { email: "asc" }],
    select: {
      id: true,
      departmentId: true,
      userName: true,
      email: true,
    },
  });

  const emailAccountsByDepartmentId = new Map<number, ImportEmailAccountOption[]>();
  emailAccounts.forEach((row) => {
    const list = emailAccountsByDepartmentId.get(row.departmentId) || [];
    list.push({
      id: row.id,
      departmentId: row.departmentId,
      userName: cleanText(row.userName),
      email: cleanText(row.email).toLowerCase(),
    });
    emailAccountsByDepartmentId.set(row.departmentId, list);
  });

  const preparedRows: PreparedImportRow[] = [];
  const rowErrors: string[] = [];
  const seenSerialNo = new Set<string>();

  rows.forEach((row) => {
    try {
      const pomsSiteCodeSystem = cleanText(row.pomsSiteCodeSystem).toUpperCase();
      if (pomsSiteCodeSystem && !departmentByCode.get(pomsSiteCodeSystem)) {
        throw new Error(`Site Code Sistem POMS "${pomsSiteCodeSystem}" tidak ditemukan di master.`);
      }

      const jobCodeText = cleanText(row.jobCode).toUpperCase();
      if (!jobCodeText) {
        throw new Error("Department wajib diisi.");
      }

      const department = departmentByCode.get(jobCodeText);
      if (!department) {
        throw new Error(`Department "${jobCodeText}" tidak ditemukan di master.`);
      }

      const departmentJobCodeText = cleanText(row.departmentJobCode).toUpperCase();
      const selectedDepartmentJobCode = departmentJobCodeText
        ? department.jobCodes.find(
          (item) => cleanText(item.code).toUpperCase() === departmentJobCodeText,
        )
        : null;
      if (departmentJobCodeText && !selectedDepartmentJobCode) {
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
      const selectedEmailAccount = resolveDeviceEmailFromImport(
        emailAccountsByDepartmentId.get(department.id) || [],
        jobCodeText,
        row.userName,
        row.userEmail,
      );

      const payload = parsePayload({
        pomsSiteCodeSystem,
        jobCodeId: department.id,
        departmentJobCodeId: selectedDepartmentJobCode?.id ?? null,
        emailAccountId: selectedEmailAccount.emailAccountId,
        picUserId: picUser.id,
        userName: selectedEmailAccount.userName,
        userEmail: selectedEmailAccount.userEmail,
        serialNo,
        category: row.category,
        model: row.model,
        hostName: row.hostName,
        location: row.location,
        ipList: row.ipList,
        startDate: row.startDate,
        endDate: row.endDate,
        leaseStatus: deriveImportLeaseStatusFromDates(row.startDate, row.endDate),
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
  userId: string;
  name: string;
  email: string;
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
    userId: picUser.id,
    name: picUser.name,
    email: picUser.email,
    jobCodeId: picUser.jobCodeId,
    jobCodeCode: jobCode.code,
    departmentJobCodeId: departmentJobCode?.id ?? null,
    departmentJobCodeCode: departmentJobCode?.code ?? null,
  };
}

async function validateDeviceEmailSelection(
  tx: Prisma.TransactionClient,
  payload: DeviceRecordPayload,
  options?: {
    existingEmailAccountId?: string | null;
    existingUserName?: string | null;
    existingUserEmail?: string | null;
  },
): Promise<{
  emailAccountId: string | null;
  userName: string | null;
  userEmail: string | null;
}> {
  const selectedEmailAccountId = cleanText(payload.emailAccountId);
  const selectedUserName = toNullableText(payload.userName);
  const selectedUserEmail = toNullableText(payload.userEmail)?.toLowerCase() ?? null;

  if (!selectedEmailAccountId) {
    if (selectedUserName || selectedUserEmail) {
      const existingEmailAccountId = cleanText(options?.existingEmailAccountId);
      const existingUserName = toNullableText(options?.existingUserName);
      const existingUserEmail = toNullableText(options?.existingUserEmail)?.toLowerCase() ?? null;
      const isUnchangedLegacySelection = !existingEmailAccountId
        && selectedUserName === existingUserName
        && selectedUserEmail === existingUserEmail;

      if (!isUnchangedLegacySelection) {
        throw new Error("User Name harus dipilih dari Data Email dengan Department yang sama.");
      }
    }

    return {
      emailAccountId: null,
      userName: selectedUserName,
      userEmail: selectedUserEmail,
    };
  }

  const emailAccount = await tx.emailAccount.findUnique({
    where: { id: selectedEmailAccountId },
    select: {
      id: true,
      departmentId: true,
      userName: true,
      email: true,
    },
  });

  if (!emailAccount) {
    throw new Error("Data Email yang dipilih tidak ditemukan.");
  }

  if (emailAccount.departmentId !== payload.jobCodeId) {
    throw new Error("User Name harus berasal dari Data Email dengan Department yang sama.");
  }

  const normalizedEmailAccountUserName = cleanText(emailAccount.userName);
  const normalizedEmailAccountEmail = cleanText(emailAccount.email).toLowerCase();

  if (selectedUserName && normalizedEmailAccountUserName !== selectedUserName) {
    throw new Error("User Name tidak sesuai dengan Data Email yang dipilih.");
  }

  if (selectedUserEmail && normalizedEmailAccountEmail !== selectedUserEmail) {
    throw new Error("User Email tidak sesuai dengan Data Email yang dipilih.");
  }

  return {
    emailAccountId: emailAccount.id,
    userName: normalizedEmailAccountUserName || null,
    userEmail: normalizedEmailAccountEmail || null,
  };
}

function getDeviceUniqueConstraintMessage(error: Prisma.PrismaClientKnownRequestError): string | null {
  if (error.code !== "P2002") {
    return null;
  }

  const targets = Array.isArray(error.meta?.target)
    ? error.meta.target.map((entry) => cleanText(entry))
    : [];

  if (targets.includes("serialNumber") || targets.includes("serial_number")) {
    return "Serial No. sudah terdaftar.";
  }

  if (targets.includes("emailAccountId") || targets.includes("email_account_id")) {
    return "Data Email tersebut sudah dipakai pada perangkat lain.";
  }

  return "Data perangkat mengandung nilai unik yang sudah terdaftar.";
}

async function resolvePomsSiteCodeSystem(
  tx: Prisma.TransactionClient,
  siteCode: string | null,
): Promise<string | null> {
  if (!siteCode) {
    return null;
  }

  const department = await tx.department.findUnique({
    where: { code: siteCode },
    select: { code: true },
  });

  if (!department) {
    throw new Error("Site Code Sistem POMS tidak ditemukan.");
  }

  return department.code;
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

async function appendLatestLeaseHistory(
  tx: Prisma.TransactionClient,
  deviceId: string,
  message: string,
): Promise<void> {
  const latestLease = await tx.leaseContract.findFirst({
    where: { deviceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      historyLog: true,
    },
  });

  if (!latestLease) {
    return;
  }

  const updatedHistoryLog = appendHistoryEntries(latestLease.historyLog, [buildHistoryEntry(message)]);
  await tx.leaseContract.update({
    where: { id: latestLease.id },
    data: {
      historyLog: updatedHistoryLog,
    },
  });
}

async function createDeviceChangeRequestEvent(
  tx: Prisma.TransactionClient,
  requestId: string,
  payload: {
    actorUserId?: string | null;
    action: string;
    note?: string | null;
    metadataJson?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await (tx as any).deviceChangeRequestEvent.create({
    data: {
      requestId,
      actorUserId: cleanText(payload.actorUserId) || null,
      action: cleanText(payload.action) || "UPDATED",
      note: toNullableText(payload.note),
      metadataJson: payload.metadataJson,
    },
  });
}

async function findPendingDeviceChangeRequestByDeviceId(
  tx: Prisma.TransactionClient,
  deviceId: string,
): Promise<{ id: string } | null> {
  return (tx as any).deviceChangeRequest.findFirst({
    where: {
      deviceId,
      status: DEVICE_CHANGE_REQUEST_STATUS_PENDING,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
    },
  });
}

async function getAdminReviewRecipients(client: { masterUser: typeof prisma.masterUser }) {
  return client.masterUser.findMany({
    where: {
      role: "admin",
      email: {
        not: "",
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

function canCurrentUserReviewDeviceChangeRequest(
  request: {
    currentStep: string;
    currentReviewerUserId: string | null;
  },
  currentUser: { id: string | null; role: string | null },
): boolean {
  const currentRole = cleanText(currentUser.role).toLowerCase();
  const currentUserId = cleanText(currentUser.id);
  if (!currentUserId && currentRole !== "admin") {
    return false;
  }

  if (
    request.currentStep === DEVICE_CHANGE_REQUEST_STEP_ADMIN_REVIEW
    || request.currentStep === DEVICE_CHANGE_REQUEST_STEP_FINAL_ADMIN_REVIEW
  ) {
    return currentRole === "admin";
  }

  if (
    request.currentStep === DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_REVIEW
    || request.currentStep === DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_ASSIGN_JOB_CODE
  ) {
    return Boolean(currentUserId && currentUserId === cleanText(request.currentReviewerUserId));
  }

  return false;
}

async function getMappedDeviceById(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.device.findUniqueOrThrow({
    where: { id },
    include: deviceRecordInclude,
  });

  return mapDeviceToFlowRecord(row as unknown as MappedDeviceRow);
}

deviceRecordRouter.get("/device-records", async (req, res, next) => {
  try {
    const scope = await resolveDataScope(req);
    const where: Prisma.DeviceWhereInput = {
      flowStatus: DEVICE_FLOW_STATUS_APPROVED,
    };

    if (scope.editorRole === "user") {
      where.jobCodeId = scope.userJobCodeId ?? undefined;
    }

    const rows = await prisma.device.findMany({
      where,
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

deviceRecordRouter.post("/device-records/notifications/hide", async (req, res, next) => {
  try {
    const userId = requireAuthenticatedUserId(req);
    const payload = (req.body ?? {}) as NotificationHidePayload;
    const hiddenKeys = await hideNotificationsForUser(userId, normalizeNotificationKeys(payload.keys));

    res.json({
      data: {
        hiddenCount: hiddenKeys.length,
        hiddenKeys,
      },
      message: hiddenKeys.length > 0
        ? "Notifikasi terpilih berhasil disembunyikan."
        : "Tidak ada notifikasi yang dipilih.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_USER_NOT_FOUND") {
      return res.status(401).json({ message: "Session login tidak ditemukan." });
    }

    next(error);
  }
});

deviceRecordRouter.post("/device-records/notifications/hide-all", async (req, res, next) => {
  try {
    const userId = requireAuthenticatedUserId(req);
    const payload = (req.body ?? {}) as NotificationHidePayload;
    const hiddenKeys = await hideNotificationsForUser(userId, normalizeNotificationKeys(payload.keys));

    res.json({
      data: {
        hiddenCount: hiddenKeys.length,
        hiddenKeys,
      },
      message: hiddenKeys.length > 0
        ? "Semua notifikasi pada daftar berhasil disembunyikan."
        : "Tidak ada notifikasi untuk disembunyikan.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_USER_NOT_FOUND") {
      return res.status(401).json({ message: "Session login tidak ditemukan." });
    }

    next(error);
  }
});

deviceRecordRouter.get("/device-records/dashboard-summary", async (req, res, next) => {
  try {
    const scope = await resolveDataScope(req);
    const where: Prisma.DeviceWhereInput = {
      flowStatus: DEVICE_FLOW_STATUS_APPROVED,
    };

    if (scope.editorRole === "user") {
      where.jobCodeId = scope.userJobCodeId ?? undefined;
    }

    const rows = await prisma.device.findMany({
      where,
      orderBy: { createdAt: "desc" },
        select: {
          id: true,
          serialNumber: true,
          hostName: true,
          picNameRaw: true,
          pomsSiteCodeSystem: true,
          jobCode: {
            select: {
              code: true,
            },
        },
        category: {
          select: {
            name: true,
          },
        },
        model: {
          select: {
            name: true,
          },
        },
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

    const totals = {
      all: 0,
      status: {
        active: 0,
        expired: 0,
        backToKddi: 0,
        other: 0,
      },
      category: {
        laptop: 0,
        desktop: 0,
        other: 0,
      },
      expiringSoon: 0,
    };

    const bySiteMap = new Map<string, {
      siteCode: string;
      total: number;
      active: number;
      expired: number;
      backToKddi: number;
      otherStatus: number;
      laptop: number;
      desktop: number;
      otherCategory: number;
      expiringSoon: number;
    }>();

    const expiringSoonDevices: Array<{
      id: string;
      siteCode: string;
      picName: string;
      serialNo: string;
      category: string;
      model: string;
      hostName: string;
      daysLease: number;
      endDate: string;
    }> = [];
    const devices: Array<{
      id: string;
      siteCode: string;
      picName: string;
      serialNo: string;
      category: string;
      model: string;
      hostName: string;
      leaseStatus: string;
      daysLease: number | null;
      endDate: string;
    }> = [];
    rows.forEach((row) => {
      totals.all += 1;

      const latestLease = row.leaseContracts[0] ?? null;
      const calculatedDaysLease = calculateDaysLease(
        latestLease?.startDate ?? null,
        latestLease?.endDate ?? null,
      );
      const normalizedDaysLease = calculatedDaysLease ?? latestLease?.daysLease ?? null;
      const leaseStatus = resolveLeaseStatus(
        latestLease?.leaseStatus ?? null,
        normalizedDaysLease,
        latestLease?.endDate ?? null,
      );

      const normalizedLeaseStatus = normalizeLeaseStatusText(leaseStatus);
      if (normalizedLeaseStatus === "ACTIVE") {
        totals.status.active += 1;
      } else if (normalizedLeaseStatus === "EXPIRED") {
        totals.status.expired += 1;
      } else if (normalizedLeaseStatus === "BACK TO KDDI") {
        totals.status.backToKddi += 1;
      } else {
        totals.status.other += 1;
      }

      const normalizedCategory = cleanText(row.category?.name).toUpperCase();
      if (normalizedCategory === "LAPTOP") {
        totals.category.laptop += 1;
      } else if (normalizedCategory === "DESKTOP") {
        totals.category.desktop += 1;
      } else {
        totals.category.other += 1;
      }

      const isExpiringSoon = typeof normalizedDaysLease === "number"
        && Number.isFinite(normalizedDaysLease)
        && normalizedDaysLease > 0
        && normalizedDaysLease <= DASHBOARD_EXPIRING_SOON_DAYS
        && normalizedLeaseStatus !== "BACK TO KDDI";

      if (isExpiringSoon) {
        totals.expiringSoon += 1;
      }

      const siteCode = cleanText(row.jobCode?.code) || "-";
      devices.push({
        id: row.id,
        siteCode,
        picName: cleanText(row.picNameRaw),
        serialNo: cleanText(row.serialNumber),
        category: cleanText(row.category?.name),
        model: cleanText(row.model?.name),
        hostName: cleanText(row.hostName),
        leaseStatus: leaseStatus ?? "",
        daysLease: typeof normalizedDaysLease === "number" ? normalizedDaysLease : null,
        endDate: formatDate(latestLease?.endDate),
      });

      const siteSummary = bySiteMap.get(siteCode) ?? {
        siteCode,
        total: 0,
        active: 0,
        expired: 0,
        backToKddi: 0,
        otherStatus: 0,
        laptop: 0,
        desktop: 0,
        otherCategory: 0,
        expiringSoon: 0,
      };
      siteSummary.total += 1;

      if (normalizedLeaseStatus === "ACTIVE") {
        siteSummary.active += 1;
      } else if (normalizedLeaseStatus === "EXPIRED") {
        siteSummary.expired += 1;
      } else if (normalizedLeaseStatus === "BACK TO KDDI") {
        siteSummary.backToKddi += 1;
      } else {
        siteSummary.otherStatus += 1;
      }

      if (normalizedCategory === "LAPTOP") {
        siteSummary.laptop += 1;
      } else if (normalizedCategory === "DESKTOP") {
        siteSummary.desktop += 1;
      } else {
        siteSummary.otherCategory += 1;
      }

      if (isExpiringSoon) {
        siteSummary.expiringSoon += 1;
      }

      bySiteMap.set(siteCode, siteSummary);

      if (isExpiringSoon) {
        expiringSoonDevices.push({
          id: row.id,
          siteCode,
          picName: cleanText(row.picNameRaw),
          serialNo: cleanText(row.serialNumber),
          category: cleanText(row.category?.name),
          model: cleanText(row.model?.name),
          hostName: cleanText(row.hostName),
          daysLease: normalizedDaysLease,
          endDate: formatDate(latestLease?.endDate),
        });
      }
    });

    const bySite = [...bySiteMap.values()]
      .sort((a, b) => {
        if (b.total !== a.total) {
          return b.total - a.total;
        }

        return a.siteCode.localeCompare(b.siteCode);
      });

    expiringSoonDevices.sort((a, b) => {
      if (a.daysLease !== b.daysLease) {
        return a.daysLease - b.daysLease;
      }

      return a.siteCode.localeCompare(b.siteCode);
    });
    devices.sort((a, b) => {
      const bySite = a.siteCode.localeCompare(b.siteCode);
      if (bySite !== 0) {
        return bySite;
      }

      return a.serialNo.localeCompare(b.serialNo);
    });

    const adminEditNotifications: Array<AdminDirectDeviceEditNotificationEntry & { deviceId: string }> = [];
    if (scope.userId) {
      const notificationToken = `${ADMIN_DIRECT_DEVICE_EDIT_NOTIFICATION_PREFIX}|recipientUserId=${encodeURIComponent(scope.userId)}`;
      const notificationRows = await prisma.device.findMany({
        where: {
          flowStatus: DEVICE_FLOW_STATUS_APPROVED,
          leaseContracts: {
            some: {
              historyLog: {
                contains: notificationToken,
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          leaseContracts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              historyLog: true,
            },
          },
        },
      });

      notificationRows.forEach((row) => {
        const latestHistoryLog = row.leaseContracts[0]?.historyLog ?? null;
        const matchedNotifications = parseAdminDirectDeviceEditNotifications(latestHistoryLog, scope.userId as string);
        matchedNotifications.forEach((entry) => {
          adminEditNotifications.push({
            ...entry,
            deviceId: row.id,
          });
        });
      });
    }

    const emailCreateNotifications: Array<AdminEmailCreateNotificationEntry & { emailAccountId: string }> = [];
    if (scope.userId) {
      const notificationToken = `${ADMIN_EMAIL_CREATE_NOTIFICATION_PREFIX}|recipientUserId=${encodeURIComponent(scope.userId)}`;
      const notificationRows = await prisma.emailAccount.findMany({
        where: {
          historyLog: {
            contains: notificationToken,
          },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          historyLog: true,
        },
      });

      notificationRows.forEach((row) => {
        const matchedNotifications = parseAdminEmailCreateNotifications(row.historyLog, scope.userId as string);
        matchedNotifications.forEach((entry) => {
          emailCreateNotifications.push({
            ...entry,
            emailAccountId: row.id,
          });
        });
      });

      const deleteNotificationRows = await prisma.emailAccountNotificationLog.findMany({
        where: {
          recipientUserId: scope.userId,
          notificationType: ADMIN_EMAIL_NOTIFICATION_TYPE_DELETED,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          originalEmailAccountId: true,
          actorName: true,
          department: true,
          jobCode: true,
          userName: true,
          email: true,
          licenseType: true,
          createdAt: true,
          notificationType: true,
        },
      });

      deleteNotificationRows.forEach((row) => {
        emailCreateNotifications.push({
          eventAt: row.createdAt.toISOString(),
          recipientUserId: scope.userId as string,
          actorName: cleanText(row.actorName),
          department: cleanText(row.department),
          jobCode: cleanText(row.jobCode),
          userName: cleanText(row.userName),
          email: cleanText(row.email),
          licenseType: cleanText(row.licenseType),
          notificationType: cleanText(row.notificationType) || ADMIN_EMAIL_NOTIFICATION_TYPE_DELETED,
          emailAccountId: cleanText(row.originalEmailAccountId) || cleanText(row.id),
        });
      });
    }

    const hiddenNotificationKeys = scope.userId
      ? await getHiddenNotificationKeys(scope.userId)
      : [];

    res.json({
      data: {
        generatedAt: new Date().toISOString(),
        totals,
        bySite,
        expiringSoonDevices,
        devices,
        adminEditNotifications,
        emailCreateNotifications,
        hiddenNotificationKeys,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_USER_NOT_FOUND") {
      return res.status(401).json({ message: "Session login tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    next(error);
  }
});

deviceRecordRouter.get("/device-records/flows", async (req, res, next) => {
  try {
    const scope = await resolveDataScope(req);
    const requestedStatuses = parseFlowStatusFilters(req.query.status);
    const statusFilters = requestedStatuses.length
      ? requestedStatuses
      : [DEVICE_FLOW_STATUS_PENDING, DEVICE_FLOW_STATUS_REJECTED, DEVICE_FLOW_STATUS_APPROVED];

    const where: Prisma.DeviceWhereInput = {
      flowStatus: {
        in: statusFilters,
      },
    };

    if (scope.editorRole === "user") {
      where.OR = [
        { flowSubmittedByUserId: scope.userId ?? undefined },
        { flowApprovedByUserId: scope.userId ?? undefined },
        { flowRejectedByUserId: scope.userId ?? undefined },
        { flowSenderSignedByUserId: scope.userId ?? undefined },
        {
          AND: [
            { flowStatus: DEVICE_FLOW_STATUS_PENDING },
            { flowAssignedPicUserId: scope.userId ?? undefined },
          ],
        },
      ];
    }

    const rows = await prisma.device.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: deviceRecordInclude,
    });

    const actorIds = [...new Set(
      rows.flatMap((row) => [
        row.flowAssignedPicUserId,
        row.flowSubmittedByUserId,
        row.flowApprovedByUserId,
        row.flowRejectedByUserId,
        row.flowSenderSignedByUserId,
      ])
        .map((value) => cleanText(value))
        .filter(Boolean),
    )];

    const users = actorIds.length > 0
      ? await prisma.masterUser.findMany({
        where: { id: { in: actorIds } },
        select: {
          id: true,
          name: true,
          jobCode: {
            select: {
              code: true,
            },
          },
        },
      })
      : [];

    const userMetaById = new Map(users.map((user) => [
      user.id,
      {
        name: user.name,
        departmentCode: cleanText(user.jobCode?.code),
      },
    ]));

    const mappedDeviceRows = mapFlowRowsWithResolvedNo(rows as unknown as MappedDeviceRow[], userMetaById);

    const includePendingStatus = statusFilters.includes(DEVICE_FLOW_STATUS_PENDING);
    const includeApprovedStatus = statusFilters.includes(DEVICE_FLOW_STATUS_APPROVED);
    const includeRejectedStatus = statusFilters.includes(DEVICE_FLOW_STATUS_REJECTED);
    const requestStatuses: DeviceChangeRequestStatus[] = [];
    if (includePendingStatus) {
      requestStatuses.push(DEVICE_CHANGE_REQUEST_STATUS_PENDING);
    }
    if (includeApprovedStatus) {
      requestStatuses.push(DEVICE_CHANGE_REQUEST_STATUS_APPROVED);
    }
    if (includeRejectedStatus) {
      requestStatuses.push(DEVICE_CHANGE_REQUEST_STATUS_REJECTED);
    }

    const changeRequestWhere: Record<string, unknown> = {
      status: {
        in: requestStatuses,
      },
    };

    if (scope.editorRole === "user") {
      changeRequestWhere.OR = [
        { requestedByUserId: scope.userId ?? undefined },
        { currentReviewerUserId: scope.userId ?? undefined },
        { targetPicUserId: scope.userId ?? undefined },
      ];
    }

    const changeRequests = await (prisma as any).deviceChangeRequest.findMany({
      where: changeRequestWhere,
      orderBy: { createdAt: "desc" },
      include: deviceChangeRequestInclude,
    });

    const mappedChangeRequestRows = mapChangeRequestRowsWithResolvedNo(
      changeRequests as unknown as MappedDeviceChangeRequestRow[],
    );

    const mappedRows = [...mappedDeviceRows, ...mappedChangeRequestRows]
      .sort((left, right) => {
        const leftDate = parseFlowDateValue(left["Flow Approved At"]) ?? parseFlowDateValue(left["Flow Rejected At"]) ?? parseFlowDateValue(left["Created At"]) ?? 0;
        const rightDate = parseFlowDateValue(right["Flow Approved At"]) ?? parseFlowDateValue(right["Flow Rejected At"]) ?? parseFlowDateValue(right["Created At"]) ?? 0;
        return rightDate - leftDate;
      });

    res.json({ data: mappedRows });
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
    const actorUserId = cleanText(req.authUser?.id) || null;

    let created = 0;
    let updated = 0;

    await prisma.$transaction(async (tx) => {
      await lockLegacyNoSequence(tx);
      let nextLegacyNo = (await tx.device.aggregate({ _max: { legacyNo: true } }))._max.legacyNo ?? 0;

      for (const row of preparedRows) {
        const payload = row.payload;
        const picUser = await validateJobAndPic(tx, payload);
        const selectedEmailAccount = await validateDeviceEmailSelection(tx, payload);
        const pomsSiteCodeSystem = await resolvePomsSiteCodeSystem(tx, payload.pomsSiteCodeSystem);
        const { categoryId, modelId, locationId } = await resolveLookupIds(tx, payload);

        const existing = payload.serialNo
          ? await tx.device.findUnique({
            where: { serialNumber: payload.serialNo },
            select: {
              id: true,
              legacyNo: true,
              emailAccountId: true,
              serialNumber: true,
              hostName: true,
              userNameRaw: true,
              userEmailRaw: true,
              locationRaw: true,
              ipListRaw: true,
              picNameRaw: true,
              notes: true,
              bitlockerKey: true,
              pomsSiteCodeSystem: true,
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
              flowStatus: DEVICE_FLOW_STATUS_APPROVED,
              flowAssignedPicUserId: payload.picUserId,
              flowSubmittedByUserId: actorUserId,
              serialNumber: payload.serialNo,
              hostName: payload.hostName,
              userNameRaw: selectedEmailAccount.userName,
              userEmailRaw: selectedEmailAccount.userEmail,
              locationRaw: payload.location,
              ipListRaw: payload.ipList,
              picNameRaw: picUser.name,
              notes: payload.keterangan,
              bitlockerKey: payload.bitlockerKey,
              pomsSiteCodeSystem,
              jobCodeId: payload.jobCodeId,
              departmentJobCodeId: payload.departmentJobCodeId,
              emailAccountId: selectedEmailAccount.emailAccountId,
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
        const selectedEmailAccountForExisting = await validateDeviceEmailSelection(tx, payload, {
          existingEmailAccountId: existing.emailAccountId,
          existingUserName: existing.userNameRaw,
          existingUserEmail: existing.userEmailRaw,
        });

        const changedFieldMessages = getChangedFieldMessages([
          {
            label: "Site Code Sistem POMS",
            before: existing.pomsSiteCodeSystem,
            after: pomsSiteCodeSystem,
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
            after: selectedEmailAccountForExisting.userName,
          },
          {
            label: "User Email",
            before: existing.userEmailRaw,
            after: selectedEmailAccountForExisting.userEmail,
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
            userNameRaw: selectedEmailAccountForExisting.userName,
            userEmailRaw: selectedEmailAccountForExisting.userEmail,
            locationRaw: payload.location,
            ipListRaw: payload.ipList,
            picNameRaw: picUser.name,
            notes: payload.keterangan,
            bitlockerKey: payload.bitlockerKey,
            pomsSiteCodeSystem,
            jobCodeId: payload.jobCodeId,
            departmentJobCodeId: payload.departmentJobCodeId,
            emailAccountId: selectedEmailAccountForExisting.emailAccountId,
            flowAssignedPicUserId: payload.picUserId,
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
      return res.status(409).json({ message: getDeviceUniqueConstraintMessage(error) ?? "Data perangkat duplikat." });
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

    const where: Prisma.DeviceWhereInput = {
      flowStatus: DEVICE_FLOW_STATUS_APPROVED,
      ...(scope.editorRole === "user" ? { jobCodeId: scope.userJobCodeId ?? undefined } : {}),
    };

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

deviceRecordRouter.get("/device-records/:id", async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const scope = await resolveDataScope(req);
    const row = await prisma.device.findUnique({
      where: { id },
      include: deviceRecordInclude,
    });

    if (!row) {
      return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
    }

    if (scope.editorRole === "user" && row.jobCodeId !== scope.userJobCodeId) {
      return res.status(403).json({ message: "Role user tidak diizinkan mengakses data perangkat di Department lain." });
    }

    const actorIds = [...new Set(
      [
        row.flowAssignedPicUserId,
        row.flowSubmittedByUserId,
        row.flowApprovedByUserId,
        row.flowRejectedByUserId,
        row.flowSenderSignedByUserId,
      ]
        .map((value) => cleanText(value))
        .filter(Boolean),
    )];

    const users = actorIds.length > 0
      ? await prisma.masterUser.findMany({
        where: { id: { in: actorIds } },
        select: {
          id: true,
          name: true,
          jobCode: {
            select: {
              code: true,
            },
          },
        },
      })
      : [];

    const userMetaById = new Map(users.map((user) => [
      user.id,
      {
        name: user.name,
        departmentCode: cleanText(user.jobCode?.code),
      },
    ]));

    const mappedRow = mapDeviceToFlowRecord(row as unknown as MappedDeviceRow, undefined, userMetaById);
    const currentRow = mapDeviceToExcelRecord(row as unknown as MappedDeviceRow);
    return res.json({
      data: {
        ...mappedRow,
        "Department": currentRow["Department"],
        "PIC Name": currentRow["PIC Name"],
      },
    });
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

deviceRecordRouter.post("/device-records/:id/change-requests", requireRole("user"), async (req, res, next) => {
  try {
    const deviceId = cleanText(req.params.id);
    if (!deviceId) {
      return res.status(400).json({ message: "ID perangkat tidak valid." });
    }

    const scope = await resolveDataScope(req);
    const currentUserId = cleanText(req.authUser?.id);
    const currentUserName = cleanText(req.authUser?.name) || "User";
    const currentUserEmail = cleanText(req.authUser?.email);
    const payload = parseDeviceChangeRequestCreatePayload(req.body);

    if (scope.editorRole !== "user" || !currentUserId) {
      return res.status(403).json({ message: "Hanya user yang dapat membuat request perubahan Job Code." });
    }

    const createdRequest = await prisma.$transaction(async (tx) => {
      const device = await tx.device.findUnique({
        where: { id: deviceId },
        include: deviceRecordInclude,
      });

      if (!device) {
        throw new Error("DATA_PERANGKAT_NOT_FOUND");
      }

      if (device.jobCodeId !== scope.userJobCodeId) {
        throw new Error("ROLE_USER_SCOPE_FORBIDDEN");
      }

      const existingPendingRequest = await findPendingDeviceChangeRequestByDeviceId(tx, deviceId);
      if (existingPendingRequest) {
        throw new Error("DEVICE_CHANGE_REQUEST_ALREADY_PENDING");
      }

      if (!device.jobCodeId) {
        throw new Error("DEVICE_DEPARTMENT_NOT_FOUND");
      }

      let requestedDepartmentJobCodeId: number | null = null;
      let targetDepartmentId: number | null = null;
      let targetPicUserId: string | null = null;
      let currentStep: DeviceChangeRequestStep;
      let currentReviewerUserId: string | null = null;

      if (payload.requestType === DEVICE_CHANGE_REQUEST_TYPE_CHANGE_JOB_CODE) {
        const requestedJobCode = payload.requestedDepartmentJobCodeId
          ? await tx.departmentJobCode.findFirst({
            where: {
              id: payload.requestedDepartmentJobCodeId,
              departmentId: device.jobCodeId,
            },
            select: {
              id: true,
              code: true,
            },
          })
          : null;

        if (!requestedJobCode) {
          throw new Error("REQUESTED_JOB_CODE_INVALID");
        }

        if (requestedJobCode.id === device.departmentJobCodeId) {
          throw new Error("REQUESTED_JOB_CODE_SAME_AS_CURRENT");
        }

        requestedDepartmentJobCodeId = requestedJobCode.id;
        currentStep = DEVICE_CHANGE_REQUEST_STEP_ADMIN_REVIEW;
      } else {
        const targetDepartment = payload.targetDepartmentId
          ? await tx.department.findUnique({
            where: { id: payload.targetDepartmentId },
            select: {
              id: true,
              code: true,
            },
          })
          : null;

        if (!targetDepartment) {
          throw new Error("TARGET_DEPARTMENT_NOT_FOUND");
        }

        if (targetDepartment.id === device.jobCodeId) {
          throw new Error("TARGET_DEPARTMENT_SAME_AS_CURRENT");
        }

        const targetPic = payload.targetPicUserId
          ? await tx.masterUser.findUnique({
            where: { id: payload.targetPicUserId },
            select: {
              id: true,
              name: true,
              email: true,
              jobCodeId: true,
            },
          })
          : null;

        if (!targetPic) {
          throw new Error("TARGET_PIC_NOT_FOUND");
        }

        if (targetPic.jobCodeId !== targetDepartment.id) {
          throw new Error("TARGET_PIC_NOT_IN_TARGET_DEPARTMENT");
        }

        targetDepartmentId = targetDepartment.id;
        targetPicUserId = targetPic.id;
        currentReviewerUserId = targetPic.id;
        currentStep = DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_REVIEW;
      }

      const request = await (tx as any).deviceChangeRequest.create({
        data: {
          deviceId,
          requestType: payload.requestType,
          status: DEVICE_CHANGE_REQUEST_STATUS_PENDING,
          currentStep,
          requestedByUserId: currentUserId,
          requestedByDepartmentId: device.jobCodeId,
          requestedNote: payload.requestedNote,
          requestedDepartmentJobCodeId,
          targetDepartmentId,
          targetPicUserId,
          currentReviewerUserId,
        },
        include: deviceChangeRequestInclude,
      });

      await createDeviceChangeRequestEvent(tx, request.id, {
        actorUserId: currentUserId,
        action: "REQUEST_CREATED",
        note: payload.requestedNote,
        metadataJson: {
          requestType: payload.requestType,
          currentStep,
          requestedDepartmentJobCodeId,
          targetDepartmentId,
          targetPicUserId,
        },
      });

      await appendLatestLeaseHistory(
        tx,
        deviceId,
        `${getDeviceChangeRequestTypeLabel(payload.requestType)} diajukan oleh ${currentUserName}.`,
      );

      return request as unknown as MappedDeviceChangeRequestRow;
    });

    try {
      if (payload.requestType === DEVICE_CHANGE_REQUEST_TYPE_CHANGE_JOB_CODE) {
        const admins = await getAdminReviewRecipients(prisma);
        for (const admin of admins) {
          await sendDeviceChangeRequestReviewEmail({
            recipientName: admin.name,
            recipientEmail: admin.email,
            requestTypeLabel: getDeviceChangeRequestTypeLabel(createdRequest.requestType),
            currentStepLabel: getDeviceChangeRequestStepLabel(createdRequest.currentStep),
            serialNo: cleanText(createdRequest.device.serialNumber),
            category: cleanText(createdRequest.device.category?.name),
            model: cleanText(createdRequest.device.model?.name),
            hostName: cleanText(createdRequest.device.hostName),
            departmentCode: cleanText(createdRequest.device.jobCode?.code),
            jobCode: cleanText(createdRequest.device.departmentJobCode?.code),
            requesterName: currentUserName,
            requesterEmail: currentUserEmail,
            requestedNote: createdRequest.requestedNote,
          });
        }
      } else if (createdRequest.targetPicUser && cleanText(createdRequest.targetPicUser.email)) {
        await sendDeviceChangeRequestReviewEmail({
          recipientName: cleanText(createdRequest.targetPicUser.name) || "PIC",
          recipientEmail: cleanText(createdRequest.targetPicUser.email),
          requestTypeLabel: getDeviceChangeRequestTypeLabel(createdRequest.requestType),
          currentStepLabel: getDeviceChangeRequestStepLabel(createdRequest.currentStep),
          serialNo: cleanText(createdRequest.device.serialNumber),
          category: cleanText(createdRequest.device.category?.name),
          model: cleanText(createdRequest.device.model?.name),
          hostName: cleanText(createdRequest.device.hostName),
          departmentCode: cleanText(createdRequest.device.jobCode?.code),
          jobCode: cleanText(createdRequest.device.departmentJobCode?.code),
          requesterName: currentUserName,
          requesterEmail: currentUserEmail,
          requestedNote: createdRequest.requestedNote,
        });
      }
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : "Unknown mail error";
      console.error(`[MAILER] Gagal kirim email request perubahan device: ${message}`);
    }

    res.status(201).json({
      data: mapChangeRequestToFlowRecord(createdRequest),
      message: "Request perubahan Job Code berhasil dibuat.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DATA_PERANGKAT_NOT_FOUND") {
      return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_SCOPE_FORBIDDEN") {
      return res.status(403).json({ message: "Role user tidak diizinkan membuat request untuk data perangkat di Department lain." });
    }

    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_ALREADY_PENDING") {
      return res.status(409).json({ message: "Masih ada request perubahan yang pending untuk perangkat ini." });
    }

    if (error instanceof Error && error.message === "REQUESTED_JOB_CODE_INVALID") {
      return res.status(400).json({ message: "Job Code baru tidak valid untuk Department saat ini." });
    }

    if (error instanceof Error && error.message === "REQUESTED_JOB_CODE_SAME_AS_CURRENT") {
      return res.status(400).json({ message: "Job Code baru harus berbeda dari Job Code saat ini." });
    }

    if (error instanceof Error && error.message === "TARGET_DEPARTMENT_NOT_FOUND") {
      return res.status(400).json({ message: "Department tujuan tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "TARGET_DEPARTMENT_SAME_AS_CURRENT") {
      return res.status(400).json({ message: "Department tujuan harus berbeda dari Department saat ini." });
    }

    if (error instanceof Error && error.message === "TARGET_PIC_NOT_FOUND") {
      return res.status(400).json({ message: "PIC tujuan tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "TARGET_PIC_NOT_IN_TARGET_DEPARTMENT") {
      return res.status(400).json({ message: "PIC tujuan harus berasal dari Department tujuan." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

deviceRecordRouter.post("/device-change-requests/:id/approve", async (req, res, next) => {
  try {
    const requestId = cleanText(req.params.id);
    if (!requestId) {
      return res.status(400).json({ message: "ID request tidak valid." });
    }

    const currentUserId = cleanText(req.authUser?.id);
    const currentUserRole = cleanText(req.authUser?.role);
    const actorName = cleanText(req.authUser?.name) || "User";
    const actorEmail = cleanText(req.authUser?.email);

    const approvedRequest = await prisma.$transaction(async (tx) => {
      const request = await (tx as any).deviceChangeRequest.findUnique({
        where: { id: requestId },
        include: deviceChangeRequestInclude,
      });

      if (!request) {
        throw new Error("DEVICE_CHANGE_REQUEST_NOT_FOUND");
      }

      if (request.status !== DEVICE_CHANGE_REQUEST_STATUS_PENDING) {
        throw new Error("DEVICE_CHANGE_REQUEST_NOT_PENDING");
      }

      if (!canCurrentUserReviewDeviceChangeRequest(
        { currentStep: request.currentStep, currentReviewerUserId: request.currentReviewerUserId },
        { id: currentUserId || null, role: currentUserRole || null },
      )) {
        throw new Error("DEVICE_CHANGE_REQUEST_FORBIDDEN");
      }

      if (
        request.requestType === DEVICE_CHANGE_REQUEST_TYPE_CHANGE_JOB_CODE
        && request.currentStep === DEVICE_CHANGE_REQUEST_STEP_ADMIN_REVIEW
      ) {
        if (!request.requestedDepartmentJobCodeId) {
          throw new Error("REQUESTED_JOB_CODE_INVALID");
        }

        const approvedAt = new Date();
        await tx.device.update({
          where: { id: request.deviceId },
          data: {
            departmentJobCodeId: request.requestedDepartmentJobCodeId,
          },
        });

        await (tx as any).deviceChangeRequest.update({
          where: { id: requestId },
          data: {
            status: DEVICE_CHANGE_REQUEST_STATUS_APPROVED,
            currentStep: DEVICE_CHANGE_REQUEST_STEP_COMPLETED,
            currentReviewerUserId: null,
            approvedAt,
          },
        });

        await createDeviceChangeRequestEvent(tx, requestId, {
          actorUserId: currentUserId,
          action: "ADMIN_APPROVED",
          note: `Job Code diubah menjadi ${cleanText(request.requestedDepartmentJobCode?.code)}`,
        });

        await appendLatestLeaseHistory(
          tx,
          request.deviceId,
          `Request ${getDeviceChangeRequestTypeLabel(request.requestType)} disetujui oleh ${actorName}.`,
        );
      } else if (
        request.requestType === DEVICE_CHANGE_REQUEST_TYPE_TRANSFER_SITE
        && request.currentStep === DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_REVIEW
      ) {
        await (tx as any).deviceChangeRequest.update({
          where: { id: requestId },
          data: {
            currentStep: DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_ASSIGN_JOB_CODE,
            currentReviewerUserId: request.targetPicUserId,
          },
        });

        await createDeviceChangeRequestEvent(tx, requestId, {
          actorUserId: currentUserId,
          action: "TARGET_PIC_APPROVED",
          note: "PIC tujuan menyetujui transfer dan lanjut memilih Job Code tujuan.",
        });
      } else if (
        request.requestType === DEVICE_CHANGE_REQUEST_TYPE_TRANSFER_SITE
        && request.currentStep === DEVICE_CHANGE_REQUEST_STEP_FINAL_ADMIN_REVIEW
      ) {
        if (!request.targetDepartmentId || !request.targetPicUserId || !request.targetDepartmentJobCodeId) {
          throw new Error("TRANSFER_APPROVAL_DATA_INCOMPLETE");
        }

        const targetPic = await tx.masterUser.findUnique({
          where: { id: request.targetPicUserId },
          select: {
            id: true,
            name: true,
            email: true,
            jobCodeId: true,
          },
        });

        if (!targetPic || targetPic.jobCodeId !== request.targetDepartmentId) {
          throw new Error("TARGET_PIC_NOT_IN_TARGET_DEPARTMENT");
        }

        const targetJobCode = await tx.departmentJobCode.findFirst({
          where: {
            id: request.targetDepartmentJobCodeId,
            departmentId: request.targetDepartmentId,
          },
          select: {
            id: true,
            code: true,
          },
        });

        if (!targetJobCode) {
          throw new Error("TARGET_JOB_CODE_INVALID");
        }

        const approvedAt = new Date();
        await tx.device.update({
          where: { id: request.deviceId },
          data: {
            jobCodeId: request.targetDepartmentId,
            departmentJobCodeId: targetJobCode.id,
            flowAssignedPicUserId: targetPic.id,
            picNameRaw: targetPic.name,
          },
        });

        await (tx as any).deviceChangeRequest.update({
          where: { id: requestId },
          data: {
            status: DEVICE_CHANGE_REQUEST_STATUS_APPROVED,
            currentStep: DEVICE_CHANGE_REQUEST_STEP_COMPLETED,
            currentReviewerUserId: null,
            approvedAt,
          },
        });

        await createDeviceChangeRequestEvent(tx, requestId, {
          actorUserId: currentUserId,
          action: "FINAL_ADMIN_APPROVED",
          note: `Transfer selesai ke ${cleanText(request.targetDepartment?.code)} / ${cleanText(targetJobCode.code)}`,
        });

        await appendLatestLeaseHistory(
          tx,
          request.deviceId,
          `Request ${getDeviceChangeRequestTypeLabel(request.requestType)} disetujui final oleh ${actorName}.`,
        );
      } else {
        throw new Error("DEVICE_CHANGE_REQUEST_STEP_NOT_APPROVABLE");
      }

      const refreshed = await (tx as any).deviceChangeRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: deviceChangeRequestInclude,
      });

      return refreshed as unknown as MappedDeviceChangeRequestRow;
    });

    try {
      if (
        approvedRequest.requestType === DEVICE_CHANGE_REQUEST_TYPE_TRANSFER_SITE
        && approvedRequest.currentStep === DEVICE_CHANGE_REQUEST_STEP_FINAL_ADMIN_REVIEW
      ) {
        const admins = await getAdminReviewRecipients(prisma);
        for (const admin of admins) {
          await sendDeviceChangeRequestReviewEmail({
            recipientName: admin.name,
            recipientEmail: admin.email,
            requestTypeLabel: getDeviceChangeRequestTypeLabel(approvedRequest.requestType),
            currentStepLabel: getDeviceChangeRequestStepLabel(approvedRequest.currentStep),
            serialNo: cleanText(approvedRequest.device.serialNumber),
            category: cleanText(approvedRequest.device.category?.name),
            model: cleanText(approvedRequest.device.model?.name),
            hostName: cleanText(approvedRequest.device.hostName),
            departmentCode: cleanText(approvedRequest.device.jobCode?.code),
            jobCode: cleanText(approvedRequest.device.departmentJobCode?.code),
            requesterName: cleanText(approvedRequest.requestedByUser?.name),
            requesterEmail: cleanText(approvedRequest.requestedByUser?.email),
            requestedNote: approvedRequest.requestedNote,
          });
        }
      } else if (approvedRequest.currentStep === DEVICE_CHANGE_REQUEST_STEP_COMPLETED) {
        if (approvedRequest.requestedByUser && cleanText(approvedRequest.requestedByUser.email)) {
          await sendDeviceChangeRequestCompletedEmail({
            recipientName: cleanText(approvedRequest.requestedByUser.name) || "User",
            recipientEmail: cleanText(approvedRequest.requestedByUser.email),
            requestTypeLabel: getDeviceChangeRequestTypeLabel(approvedRequest.requestType),
            serialNo: cleanText(approvedRequest.device.serialNumber),
            category: cleanText(approvedRequest.device.category?.name),
            model: cleanText(approvedRequest.device.model?.name),
            hostName: cleanText(approvedRequest.device.hostName),
            departmentCode: cleanText(approvedRequest.device.jobCode?.code),
            jobCode: cleanText(approvedRequest.device.departmentJobCode?.code),
            targetDepartmentCode: cleanText(approvedRequest.targetDepartment?.code),
            targetJobCode: cleanText(approvedRequest.targetDepartmentJobCode?.code),
            approvedByName: actorName,
            approvedByEmail: actorEmail,
          });
        }

        if (
          approvedRequest.requestType === DEVICE_CHANGE_REQUEST_TYPE_TRANSFER_SITE
          && approvedRequest.targetPicUser
          && cleanText(approvedRequest.targetPicUser.email)
        ) {
          await sendDeviceChangeRequestCompletedEmail({
            recipientName: cleanText(approvedRequest.targetPicUser.name) || "PIC",
            recipientEmail: cleanText(approvedRequest.targetPicUser.email),
            requestTypeLabel: getDeviceChangeRequestTypeLabel(approvedRequest.requestType),
            serialNo: cleanText(approvedRequest.device.serialNumber),
            category: cleanText(approvedRequest.device.category?.name),
            model: cleanText(approvedRequest.device.model?.name),
            hostName: cleanText(approvedRequest.device.hostName),
            departmentCode: cleanText(approvedRequest.device.jobCode?.code),
            jobCode: cleanText(approvedRequest.device.departmentJobCode?.code),
            targetDepartmentCode: cleanText(approvedRequest.targetDepartment?.code),
            targetJobCode: cleanText(approvedRequest.targetDepartmentJobCode?.code),
            approvedByName: actorName,
            approvedByEmail: actorEmail,
          });
        }
      }
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : "Unknown mail error";
      console.error(`[MAILER] Gagal kirim email approve request perubahan device: ${message}`);
    }

    res.json({
      data: mapChangeRequestToFlowRecord(approvedRequest),
      message: "Request perubahan berhasil diproses.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_NOT_FOUND") {
      return res.status(404).json({ message: "Request perubahan tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_NOT_PENDING") {
      return res.status(400).json({ message: "Request perubahan ini sudah selesai diproses." });
    }

    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_FORBIDDEN") {
      return res.status(403).json({ message: "Akun ini tidak berhak melakukan approve pada step aktif." });
    }

    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_STEP_NOT_APPROVABLE") {
      return res.status(400).json({ message: "Step aktif tidak dapat di-approve dari endpoint ini." });
    }

    if (error instanceof Error && error.message === "TRANSFER_APPROVAL_DATA_INCOMPLETE") {
      return res.status(400).json({ message: "Data transfer belum lengkap. PIC tujuan harus memilih Job Code tujuan terlebih dahulu." });
    }

    if (error instanceof Error && error.message === "TARGET_JOB_CODE_INVALID") {
      return res.status(400).json({ message: "Job Code tujuan tidak valid untuk Department tujuan." });
    }

    if (error instanceof Error && error.message === "TARGET_PIC_NOT_IN_TARGET_DEPARTMENT") {
      return res.status(400).json({ message: "PIC tujuan sudah tidak sesuai dengan Department tujuan." });
    }

    if (error instanceof Error && error.message === "REQUESTED_JOB_CODE_INVALID") {
      return res.status(400).json({ message: "Job Code request tidak valid." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

deviceRecordRouter.post("/device-change-requests/:id/reject", async (req, res, next) => {
  try {
    const requestId = cleanText(req.params.id);
    if (!requestId) {
      return res.status(400).json({ message: "ID request tidak valid." });
    }

    const payload = parseFlowActionPayload(req.body);
    const rejectNote = cleanText(payload.note);
    if (!rejectNote) {
      return res.status(400).json({ message: "Alasan reject wajib diisi." });
    }

    const currentUserId = cleanText(req.authUser?.id);
    const currentUserRole = cleanText(req.authUser?.role);
    const actorName = cleanText(req.authUser?.name) || "User";
    const actorEmail = cleanText(req.authUser?.email);

    const rejectedRequest = await prisma.$transaction(async (tx) => {
      const request = await (tx as any).deviceChangeRequest.findUnique({
        where: { id: requestId },
        include: deviceChangeRequestInclude,
      });

      if (!request) {
        throw new Error("DEVICE_CHANGE_REQUEST_NOT_FOUND");
      }

      if (request.status !== DEVICE_CHANGE_REQUEST_STATUS_PENDING) {
        throw new Error("DEVICE_CHANGE_REQUEST_NOT_PENDING");
      }

      if (
        request.currentStep !== DEVICE_CHANGE_REQUEST_STEP_ADMIN_REVIEW
        && request.currentStep !== DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_REVIEW
        && request.currentStep !== DEVICE_CHANGE_REQUEST_STEP_FINAL_ADMIN_REVIEW
      ) {
        throw new Error("DEVICE_CHANGE_REQUEST_STEP_NOT_REJECTABLE");
      }

      if (!canCurrentUserReviewDeviceChangeRequest(
        { currentStep: request.currentStep, currentReviewerUserId: request.currentReviewerUserId },
        { id: currentUserId || null, role: currentUserRole || null },
      )) {
        throw new Error("DEVICE_CHANGE_REQUEST_FORBIDDEN");
      }

      const rejectedAt = new Date();
      await (tx as any).deviceChangeRequest.update({
        where: { id: requestId },
        data: {
          status: DEVICE_CHANGE_REQUEST_STATUS_REJECTED,
          currentStep: DEVICE_CHANGE_REQUEST_STEP_REJECTED,
          currentReviewerUserId: null,
          latestRejectReason: rejectNote,
          rejectedAt,
        },
      });

      await createDeviceChangeRequestEvent(tx, requestId, {
        actorUserId: currentUserId,
        action: "REQUEST_REJECTED",
        note: rejectNote,
      });

      await appendLatestLeaseHistory(
        tx,
        request.deviceId,
        `Request ${getDeviceChangeRequestTypeLabel(request.requestType)} ditolak oleh ${actorName}.`,
      );

      const refreshed = await (tx as any).deviceChangeRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: deviceChangeRequestInclude,
      });

      return refreshed as unknown as MappedDeviceChangeRequestRow;
    });

    try {
      if (rejectedRequest.requestedByUser && cleanText(rejectedRequest.requestedByUser.email)) {
        await sendDeviceChangeRequestRejectedEmail({
          recipientName: cleanText(rejectedRequest.requestedByUser.name) || "User",
          recipientEmail: cleanText(rejectedRequest.requestedByUser.email),
          requestTypeLabel: getDeviceChangeRequestTypeLabel(rejectedRequest.requestType),
          serialNo: cleanText(rejectedRequest.device.serialNumber),
          category: cleanText(rejectedRequest.device.category?.name),
          model: cleanText(rejectedRequest.device.model?.name),
          hostName: cleanText(rejectedRequest.device.hostName),
          departmentCode: cleanText(rejectedRequest.device.jobCode?.code),
          jobCode: cleanText(rejectedRequest.device.departmentJobCode?.code),
          rejectedByName: actorName,
          rejectedByEmail: actorEmail,
          rejectNote,
        });
      }
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : "Unknown mail error";
      console.error(`[MAILER] Gagal kirim email reject request perubahan device: ${message}`);
    }

    res.json({
      data: mapChangeRequestToFlowRecord(rejectedRequest),
      message: "Request perubahan berhasil ditolak.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_NOT_FOUND") {
      return res.status(404).json({ message: "Request perubahan tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_NOT_PENDING") {
      return res.status(400).json({ message: "Request perubahan ini sudah selesai diproses." });
    }

    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_FORBIDDEN") {
      return res.status(403).json({ message: "Akun ini tidak berhak melakukan reject pada step aktif." });
    }

    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_STEP_NOT_REJECTABLE") {
      return res.status(400).json({ message: "Step aktif tidak dapat direject dari endpoint ini." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

deviceRecordRouter.post("/device-change-requests/:id/assign-job-code", async (req, res, next) => {
  try {
    const requestId = cleanText(req.params.id);
    if (!requestId) {
      return res.status(400).json({ message: "ID request tidak valid." });
    }

    const payload = parseDeviceChangeRequestAssignPayload(req.body);
    const currentUserId = cleanText(req.authUser?.id);
    const currentUserRole = cleanText(req.authUser?.role);
    const actorName = cleanText(req.authUser?.name) || "User";
    const actorEmail = cleanText(req.authUser?.email);

    const assignedRequest = await prisma.$transaction(async (tx) => {
      const request = await (tx as any).deviceChangeRequest.findUnique({
        where: { id: requestId },
        include: deviceChangeRequestInclude,
      });

      if (!request) {
        throw new Error("DEVICE_CHANGE_REQUEST_NOT_FOUND");
      }

      if (request.status !== DEVICE_CHANGE_REQUEST_STATUS_PENDING) {
        throw new Error("DEVICE_CHANGE_REQUEST_NOT_PENDING");
      }

      if (request.currentStep !== DEVICE_CHANGE_REQUEST_STEP_TARGET_PIC_ASSIGN_JOB_CODE) {
        throw new Error("DEVICE_CHANGE_REQUEST_STEP_NOT_ASSIGNABLE");
      }

      if (!canCurrentUserReviewDeviceChangeRequest(
        { currentStep: request.currentStep, currentReviewerUserId: request.currentReviewerUserId },
        { id: currentUserId || null, role: currentUserRole || null },
      )) {
        throw new Error("DEVICE_CHANGE_REQUEST_FORBIDDEN");
      }

      if (!request.targetDepartmentId) {
        throw new Error("TARGET_DEPARTMENT_NOT_FOUND");
      }

      const targetDepartmentJobCode = await tx.departmentJobCode.findFirst({
        where: {
          id: payload.targetDepartmentJobCodeId,
          departmentId: request.targetDepartmentId,
        },
        select: {
          id: true,
          code: true,
        },
      });

      if (!targetDepartmentJobCode) {
        throw new Error("TARGET_JOB_CODE_INVALID");
      }

      await (tx as any).deviceChangeRequest.update({
        where: { id: requestId },
        data: {
          targetDepartmentJobCodeId: targetDepartmentJobCode.id,
          currentStep: DEVICE_CHANGE_REQUEST_STEP_FINAL_ADMIN_REVIEW,
          currentReviewerUserId: null,
        },
      });

      await createDeviceChangeRequestEvent(tx, requestId, {
        actorUserId: currentUserId,
        action: "TARGET_PIC_ASSIGNED_JOB_CODE",
        note: `PIC tujuan memilih Job Code ${targetDepartmentJobCode.code}.`,
      });

      const refreshed = await (tx as any).deviceChangeRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: deviceChangeRequestInclude,
      });

      return refreshed as unknown as MappedDeviceChangeRequestRow;
    });

    try {
      const admins = await getAdminReviewRecipients(prisma);
      for (const admin of admins) {
        await sendDeviceChangeRequestReviewEmail({
          recipientName: admin.name,
          recipientEmail: admin.email,
          requestTypeLabel: getDeviceChangeRequestTypeLabel(assignedRequest.requestType),
          currentStepLabel: getDeviceChangeRequestStepLabel(assignedRequest.currentStep),
          serialNo: cleanText(assignedRequest.device.serialNumber),
          category: cleanText(assignedRequest.device.category?.name),
          model: cleanText(assignedRequest.device.model?.name),
          hostName: cleanText(assignedRequest.device.hostName),
          departmentCode: cleanText(assignedRequest.device.jobCode?.code),
          jobCode: cleanText(assignedRequest.device.departmentJobCode?.code),
          requesterName: cleanText(assignedRequest.requestedByUser?.name),
          requesterEmail: cleanText(assignedRequest.requestedByUser?.email),
          requestedNote: assignedRequest.requestedNote,
        });
      }
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : "Unknown mail error";
      console.error(`[MAILER] Gagal kirim email assign Job Code request perubahan device: ${message}`);
    }

    res.json({
      data: mapChangeRequestToFlowRecord(assignedRequest),
      message: "Job Code tujuan berhasil dipilih dan dikirim ke Admin.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_NOT_FOUND") {
      return res.status(404).json({ message: "Request perubahan tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_NOT_PENDING") {
      return res.status(400).json({ message: "Request perubahan ini sudah selesai diproses." });
    }

    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_FORBIDDEN") {
      return res.status(403).json({ message: "Akun ini tidak berhak memilih Job Code pada step aktif." });
    }

    if (error instanceof Error && error.message === "DEVICE_CHANGE_REQUEST_STEP_NOT_ASSIGNABLE") {
      return res.status(400).json({ message: "Step aktif belum berada pada tahap pilih Job Code tujuan." });
    }

    if (error instanceof Error && error.message === "TARGET_JOB_CODE_INVALID") {
      return res.status(400).json({ message: "Job Code tujuan tidak valid untuk Department tujuan." });
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

    const createdResult = await prisma.$transaction(async (tx) => {
      const picUser = await validateJobAndPic(tx, payload);
      const selectedEmailAccount = await validateDeviceEmailSelection(tx, payload);
      const pomsSiteCodeSystem = await resolvePomsSiteCodeSystem(tx, payload.pomsSiteCodeSystem);
      const { categoryId, modelId, locationId } = await resolveLookupIds(tx, payload);
      await lockLegacyNoSequence(tx);
      const nextLegacyNo = await getNextLegacyNo(tx);

      const device = await tx.device.create({
        data: {
          legacyNo: nextLegacyNo,
          flowStatus: DEVICE_FLOW_STATUS_PENDING,
          flowAssignedPicUserId: payload.picUserId,
          flowSubmittedByUserId: cleanText(req.authUser?.id) || null,
          serialNumber: payload.serialNo,
          hostName: payload.hostName,
          userNameRaw: selectedEmailAccount.userName,
          userEmailRaw: selectedEmailAccount.userEmail,
          locationRaw: payload.location,
          ipListRaw: payload.ipList,
          picNameRaw: picUser.name,
          notes: payload.keterangan,
          bitlockerKey: payload.bitlockerKey,
          pomsSiteCodeSystem,
          jobCodeId: payload.jobCodeId,
          departmentJobCodeId: payload.departmentJobCodeId,
          emailAccountId: selectedEmailAccount.emailAccountId,
          categoryId,
          modelId,
          locationId,
        },
      });

      await syncDeviceIps(tx, device.id, payload.ipList);
      const createdHistoryLog = appendHistoryEntries(payload.hystoryLog, [
        buildHistoryEntry(
          `Data perangkat dibuat oleh ${actorName || picUser.name}${payload.serialNo ? ` (Serial No: ${payload.serialNo})` : ""
          } dan menunggu konfirmasi user.`,
        ),
      ]);

      await syncLatestLease(tx, device.id, {
        ...payload,
        hystoryLog: createdHistoryLog,
      });

      const mappedDevice = await getMappedDeviceById(tx, device.id);
      return {
        mappedDevice,
        notification: {
          recipientName: picUser.name,
          recipientEmail: picUser.email,
          departmentCode: picUser.jobCodeCode,
          siteCode: picUser.departmentJobCodeCode ?? "",
          serialNo: payload.serialNo ?? "",
          category: payload.category ?? "",
          model: payload.model ?? "",
          hostName: payload.hostName ?? "",
        },
      };
    });

    const created = createdResult.mappedDevice;
    try {
      await sendDeviceFlowPendingEmail({
        ...createdResult.notification,
        submittedByName: cleanText(req.authUser?.name) || actorName || "Admin",
        submittedByEmail: cleanText(req.authUser?.email) || "",
      });
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : "Unknown mail error";
      console.error(`[MAILER] Gagal kirim notifikasi flow create device: ${message}`);
    }

    res.status(201).json({ data: created });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: getDeviceUniqueConstraintMessage(error) ?? "Data perangkat duplikat." });
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

    const scope = await resolveDataScope(req);
    const { editorRole, userJobCodeId } = scope;
    const payload = parsePayload(req.body);
    const actorName = getHistoryActorName(req);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.device.findUnique({
        where: { id },
        select: {
          id: true,
          legacyNo: true,
          pomsSiteCodeSystem: true,
          emailAccountId: true,
          jobCodeId: true,
          departmentJobCodeId: true,
          flowAssignedPicUserId: true,
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

      if (editorRole === "admin" && payload.departmentJobCodeId === null) {
        throw new Error("ADMIN_DIRECT_EDIT_JOB_CODE_REQUIRED");
      }

      const picUser = await validateJobAndPic(tx, payload);
      const selectedEmailAccount = await validateDeviceEmailSelection(tx, payload, {
        existingEmailAccountId: existing.emailAccountId,
        existingUserName: existing.userNameRaw,
        existingUserEmail: existing.userEmailRaw,
      });
      const pomsSiteCodeSystem = await resolvePomsSiteCodeSystem(tx, payload.pomsSiteCodeSystem);
      const { categoryId, modelId, locationId } = await resolveLookupIds(tx, payload);
      const latestLease = existing.leaseContracts[0] ?? null;

      if (isBackToKddiLeaseStatus(latestLease?.leaseStatus)) {
        throw new Error("LEASE_STATUS_BACK_TO_KDDI_LOCKED");
      }

      let resolvedLegacyNo = existing.legacyNo;
      if (!(typeof resolvedLegacyNo === "number" && Number.isFinite(resolvedLegacyNo) && resolvedLegacyNo > 0)) {
        await lockLegacyNoSequence(tx);
        resolvedLegacyNo = await getNextLegacyNo(tx);
      }

      if (editorRole === "user") {
        const restrictedChangedLabels = getChangedFieldLabels([
          {
            label: "Site Code Sistem POMS",
            before: existing.pomsSiteCodeSystem,
            after: pomsSiteCodeSystem,
          },
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
            label: "Job Code",
            before: existing.departmentJobCodeId,
            after: payload.departmentJobCodeId,
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
          label: "Site Code Sistem POMS",
          before: existing.pomsSiteCodeSystem,
          after: pomsSiteCodeSystem,
        },
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

      const adminDirectEditNotificationCandidates = new Map<string, AdminDirectDeviceEditRecipientRole>();
      const adminDirectAssignmentChanged = editorRole === "admin" && (
        cleanText(existing.flowAssignedPicUserId) !== cleanText(picUser.userId)
        || existing.jobCodeId !== payload.jobCodeId
        || existing.departmentJobCodeId !== payload.departmentJobCodeId
        || cleanText(existing.pomsSiteCodeSystem) !== cleanText(pomsSiteCodeSystem)
      );

      if (adminDirectAssignmentChanged) {
        const previousPicUserId = cleanText(existing.flowAssignedPicUserId);
        const nextPicUserId = cleanText(picUser.userId);

        if (previousPicUserId) {
          adminDirectEditNotificationCandidates.set(previousPicUserId, "SOURCE");
        }

        if (nextPicUserId) {
          const previousRole = adminDirectEditNotificationCandidates.get(nextPicUserId);
          adminDirectEditNotificationCandidates.set(
            nextPicUserId,
            previousRole === "SOURCE" ? "SOURCE_AND_TARGET" : "TARGET",
          );
        }

        adminDirectEditNotificationCandidates.forEach((recipientRole, recipientUserId) => {
          historyEntries.push(
            buildHistoryEntry(
              buildAdminDirectDeviceEditNotificationMarker({
                recipientUserId,
                recipientRole,
                actorName,
                serialNo: cleanText(payload.serialNo),
                hostName: cleanText(payload.hostName),
                category: cleanText(payload.category),
                model: cleanText(payload.model),
                fromDepartment: cleanText(existing.jobCode?.code),
                fromJobCode: cleanText(existing.departmentJobCode?.code),
                fromPicName: cleanText(existing.picNameRaw),
                fromPomsSiteCodeSystem: cleanText(existing.pomsSiteCodeSystem),
                toDepartment: cleanText(picUser.jobCodeCode),
                toJobCode: cleanText(picUser.departmentJobCodeCode),
                toPicName: cleanText(picUser.name),
                toPomsSiteCodeSystem: cleanText(pomsSiteCodeSystem),
              }),
            ),
          );
        });
      }

      const updatedHistoryLog = appendHistoryEntries(latestLease?.historyLog, historyEntries);

      await tx.device.update({
        where: { id },
        data: {
          legacyNo: resolvedLegacyNo,
          serialNumber: payload.serialNo,
          hostName: payload.hostName,
          userNameRaw: selectedEmailAccount.userName,
          userEmailRaw: selectedEmailAccount.userEmail,
          locationRaw: payload.location,
          ipListRaw: payload.ipList,
          flowAssignedPicUserId: picUser.userId,
          picNameRaw: picUser.name,
          notes: payload.keterangan,
          bitlockerKey: payload.bitlockerKey,
          pomsSiteCodeSystem,
          jobCodeId: payload.jobCodeId,
          departmentJobCodeId: payload.departmentJobCodeId,
          emailAccountId: selectedEmailAccount.emailAccountId,
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
      return res.status(409).json({ message: getDeviceUniqueConstraintMessage(error) ?? "Data perangkat duplikat." });
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

    if (error instanceof Error && error.message === "ADMIN_DIRECT_EDIT_JOB_CODE_REQUIRED") {
      return res.status(400).json({ message: "Job Code wajib dipilih saat Admin melakukan direct edit data perangkat." });
    }

    if (error instanceof Error && error.message.startsWith("ROLE_USER_FORBIDDEN_FIELDS:")) {
      const changedColumns = error.message.replace("ROLE_USER_FORBIDDEN_FIELDS:", "").trim();
      return res.status(403).json({
        message: `Role user hanya boleh edit kolom User Name, Location, IP List, dan Keterangan. User Email terisi otomatis dari Data Email. Perubahan Job Code harus melalui workflow approval. Kolom tidak diizinkan: ${changedColumns}.`,
      });
    }

    if (error instanceof Error && error.message === "LEASE_STATUS_BACK_TO_KDDI_LOCKED") {
      return res.status(400).json({ message: "Data perangkat dengan Lease Status Back To KDDI tidak dapat diedit." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

deviceRecordRouter.post("/device-records/:id/flow/approve", async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const scope = await resolveDataScope(req);
    const { editorRole, userJobCodeId } = scope;
    const payload = parseFlowActionPayload(req.body, { requireSignature: true });
    const actorName = getHistoryActorName(req);

    const approvedResult = await prisma.$transaction(async (tx) => {
      const approvedAt = new Date();
      const existing = await tx.device.findUnique({
        where: { id },
        select: {
          id: true,
          jobCodeId: true,
          flowAssignedPicUserId: true,
          flowSubmittedByUserId: true,
          flowStatus: true,
          serialNumber: true,
          hostName: true,
          flowSenderSignature: true,
          category: {
            select: { name: true },
          },
          model: {
            select: { name: true },
          },
          jobCode: {
            select: { code: true },
          },
          departmentJobCode: {
            select: { code: true },
          },
        },
      });

      if (!existing) {
        throw new Error("DATA_PERANGKAT_NOT_FOUND");
      }

      if (editorRole === "user" && existing.jobCodeId !== userJobCodeId) {
        throw new Error("ROLE_USER_SCOPE_FORBIDDEN");
      }

      const assignedPicUserId = cleanText(existing.flowAssignedPicUserId);
      const currentUserId = cleanText(scope.userId);
      if (assignedPicUserId && currentUserId && assignedPicUserId !== currentUserId) {
        throw new Error("FLOW_ASSIGNEE_FORBIDDEN");
      }

      if (cleanText(existing.flowStatus) !== DEVICE_FLOW_STATUS_PENDING) {
        throw new Error("Data tidak dalam status menunggu konfirmasi.");
      }

      await tx.device.update({
        where: { id },
        data: {
          flowStatus: DEVICE_FLOW_STATUS_APPROVED,
          flowApprovedByUserId: cleanText(req.authUser?.id) || null,
          flowApprovedAt: approvedAt,
          flowRejectedByUserId: null,
          flowRejectedAt: null,
          flowRejectNote: null,
          flowRecipientSignature: payload.signatureDataUrl,
        },
      });

      await appendLatestLeaseHistory(
        tx,
        id,
        `Flow perangkat disetujui oleh ${actorName}${existing.serialNumber ? ` (Serial No: ${existing.serialNumber})` : ""}.`,
      );

      const mappedDevice = await getMappedDeviceById(tx, id);
      return {
        mappedDevice,
        notification: {
          submittedByUserId: cleanText(existing.flowSubmittedByUserId),
          departmentCode: cleanText(existing.jobCode?.code),
          siteCode: cleanText(existing.departmentJobCode?.code),
          serialNo: cleanText(existing.serialNumber),
          category: cleanText(existing.category?.name),
          model: cleanText(existing.model?.name),
          hostName: cleanText(existing.hostName),
          approvedAt,
          senderSignatureDataUrl: cleanText(existing.flowSenderSignature),
          receiverSignatureDataUrl: cleanText(payload.signatureDataUrl),
        },
      };
    });

    const updated = approvedResult.mappedDevice;
    const notification = approvedResult.notification;
    try {
      const submitterUserId = cleanText(notification.submittedByUserId);
      const recipients: Array<{ name: string; email: string; departmentCode: string }> = [];
      let submitterName = "";
      let submitterDepartmentCode = "";
      if (submitterUserId) {
        const submitter = await prisma.masterUser.findUnique({
          where: { id: submitterUserId },
          select: {
            name: true,
            email: true,
            role: true,
            jobCode: {
              select: {
                code: true,
              },
            },
          },
        });

        submitterName = cleanText(submitter?.name);
        submitterDepartmentCode = cleanText(submitter?.jobCode?.code);

        if (submitter && cleanText(submitter.email) && cleanText(submitter.role).toLowerCase() === "admin") {
          recipients.push({
            name: submitter.name,
            email: submitter.email,
            departmentCode: cleanText(submitter.jobCode?.code),
          });
        }
      }

      if (recipients.length === 0) {
        const adminFallback = await prisma.masterUser.findMany({
          where: { role: "admin" },
          select: {
            name: true,
            email: true,
            jobCode: {
              select: {
                code: true,
              },
            },
          },
          orderBy: {
            name: "asc",
          },
          take: 1,
        });

        adminFallback.forEach((admin) => {
          if (cleanText(admin.email)) {
            recipients.push({
              name: admin.name,
              email: admin.email,
              departmentCode: cleanText(admin.jobCode?.code),
            });
          }
        });
      }

      const uniqueRecipients = [...new Map(
        recipients
          .filter((recipient) => cleanText(recipient.email))
          .map((recipient) => [cleanText(recipient.email).toLowerCase(), recipient]),
      ).values()];

      if (uniqueRecipients.length > 0) {
        const approverName = cleanText(req.authUser?.name) || actorName || "User";
        const approverEmail = cleanText(req.authUser?.email) || "";
        const approverUserId = cleanText(req.authUser?.id);
        let approverDepartmentCode = "";
        if (approverUserId) {
          const approverUser = await prisma.masterUser.findUnique({
            where: { id: approverUserId },
            select: {
              jobCode: {
                select: {
                  code: true,
                },
              },
            },
          });
          approverDepartmentCode = cleanText(approverUser?.jobCode?.code);
        }

        const senderName = submitterName || cleanText(uniqueRecipients[0]?.name) || "Admin";
        const senderDepartment = submitterDepartmentCode
          || cleanText(uniqueRecipients[0]?.departmentCode)
          || cleanText(notification.departmentCode)
          || "-";
        const receiverName = approverName;
        const receiverDepartment = approverDepartmentCode || cleanText(notification.departmentCode) || "-";

        const safeSerial = cleanText(notification.serialNo).replace(/[^A-Za-z0-9._-]+/g, "-");
        const bastFileName = `BAST-${safeSerial || "device"}.pdf`;
        const bastPdfBuffer = await createBastPdfBuffer({
          approvedAt: notification.approvedAt,
          senderName,
          senderDepartment,
          receiverName,
          receiverDepartment,
          department: cleanText(notification.departmentCode),
          serialNo: cleanText(notification.serialNo),
          category: cleanText(notification.category),
          model: cleanText(notification.model),
          hostName: cleanText(notification.hostName),
          senderSignatureDataUrl: notification.senderSignatureDataUrl,
          receiverSignatureDataUrl: notification.receiverSignatureDataUrl,
        });

        for (const recipient of uniqueRecipients) {
          await sendDeviceFlowApprovedBastEmail({
            recipientName: cleanText(recipient.name) || "Admin",
            recipientEmail: cleanText(recipient.email),
            departmentCode: cleanText(notification.departmentCode),
            siteCode: cleanText(notification.siteCode),
            serialNo: cleanText(notification.serialNo),
            category: cleanText(notification.category),
            model: cleanText(notification.model),
            hostName: cleanText(notification.hostName),
            approvedByName: approverName,
            approvedByEmail: approverEmail,
            bastFileName,
            bastPdfBuffer,
          });
        }
      }
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : "Unknown mail error";
      console.error(`[MAILER] Gagal kirim notifikasi flow approve + BAST ke admin: ${message}`);
    }

    res.json({ data: updated, message: "Perangkat berhasil disetujui." });
  } catch (error) {
    if (error instanceof Error && error.message === "DATA_PERANGKAT_NOT_FOUND") {
      return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_SCOPE_FORBIDDEN") {
      return res.status(403).json({ message: "Role user tidak diizinkan mengakses data perangkat di Department lain." });
    }

    if (error instanceof Error && error.message === "FLOW_ASSIGNEE_FORBIDDEN") {
      return res.status(403).json({ message: "Perangkat ini di-assign ke PIC lain, akun ini tidak bisa melakukan konfirmasi." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

deviceRecordRouter.post("/device-records/:id/flow/reject", async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const scope = await resolveDataScope(req);
    const { editorRole, userJobCodeId } = scope;
    const payload = parseFlowActionPayload(req.body);
    const actorName = getHistoryActorName(req);
    const rejectNote = cleanText(payload.note);
    if (!rejectNote) {
      return res.status(400).json({ message: "Alasan penolakan wajib diisi." });
    }

    const rejectedResult = await prisma.$transaction(async (tx) => {
      const existing = await tx.device.findUnique({
        where: { id },
        select: {
          id: true,
          jobCodeId: true,
          flowAssignedPicUserId: true,
          flowSubmittedByUserId: true,
          flowStatus: true,
          serialNumber: true,
          hostName: true,
          category: {
            select: { name: true },
          },
          model: {
            select: { name: true },
          },
          jobCode: {
            select: { code: true },
          },
          departmentJobCode: {
            select: { code: true },
          },
        },
      });

      if (!existing) {
        throw new Error("DATA_PERANGKAT_NOT_FOUND");
      }

      if (editorRole === "user" && existing.jobCodeId !== userJobCodeId) {
        throw new Error("ROLE_USER_SCOPE_FORBIDDEN");
      }

      const assignedPicUserId = cleanText(existing.flowAssignedPicUserId);
      const currentUserId = cleanText(scope.userId);
      if (assignedPicUserId && currentUserId && assignedPicUserId !== currentUserId) {
        throw new Error("FLOW_ASSIGNEE_FORBIDDEN");
      }

      if (cleanText(existing.flowStatus) !== DEVICE_FLOW_STATUS_PENDING) {
        throw new Error("Data tidak dalam status menunggu konfirmasi.");
      }

      await tx.device.update({
        where: { id },
        data: {
          flowStatus: DEVICE_FLOW_STATUS_REJECTED,
          flowRejectedByUserId: cleanText(req.authUser?.id) || null,
          flowRejectedAt: new Date(),
          flowRejectNote: rejectNote,
          flowApprovedByUserId: null,
          flowApprovedAt: null,
          flowRecipientSignature: null,
          flowSenderSignature: null,
          flowSenderSignedByUserId: null,
          flowSenderSignedAt: null,
        },
      });

      await appendLatestLeaseHistory(
        tx,
        id,
        `Flow perangkat ditolak oleh ${actorName}${existing.serialNumber ? ` (Serial No: ${existing.serialNumber})` : ""}. Alasan: ${rejectNote}`,
      );

      const mappedDevice = await getMappedDeviceById(tx, id);
      return {
        mappedDevice,
        notification: {
          submittedByUserId: cleanText(existing.flowSubmittedByUserId),
          departmentCode: cleanText(existing.jobCode?.code),
          siteCode: cleanText(existing.departmentJobCode?.code),
          serialNo: cleanText(existing.serialNumber),
          category: cleanText(existing.category?.name),
          model: cleanText(existing.model?.name),
          hostName: cleanText(existing.hostName),
          rejectNote,
        },
      };
    });

    const updated = rejectedResult.mappedDevice;
    const notification = rejectedResult.notification;
    try {
      const recipients: Array<{ name: string; email: string }> = [];
      if (notification.submittedByUserId) {
        const submitter = await prisma.masterUser.findUnique({
          where: { id: notification.submittedByUserId },
          select: {
            name: true,
            email: true,
            role: true,
          },
        });

        if (submitter && cleanText(submitter.email) && cleanText(submitter.role).toLowerCase() === "admin") {
          recipients.push({
            name: submitter.name,
            email: submitter.email,
          });
        }
      }

      if (recipients.length === 0) {
        const adminFallback = await prisma.masterUser.findMany({
          where: { role: "admin" },
          select: {
            name: true,
            email: true,
          },
          orderBy: {
            name: "asc",
          },
          take: 1,
        });

        adminFallback.forEach((admin) => {
          if (cleanText(admin.email)) {
            recipients.push({
              name: admin.name,
              email: admin.email,
            });
          }
        });
      }

      const uniqueRecipients = [...new Map(
        recipients
          .filter((recipient) => cleanText(recipient.email))
          .map((recipient) => [cleanText(recipient.email).toLowerCase(), recipient]),
      ).values()];

      for (const recipient of uniqueRecipients) {
        await sendDeviceFlowRejectedEmail({
          recipientName: cleanText(recipient.name) || "Admin",
          recipientEmail: cleanText(recipient.email),
          departmentCode: notification.departmentCode,
          siteCode: notification.siteCode,
          serialNo: notification.serialNo,
          category: notification.category,
          model: notification.model,
          hostName: notification.hostName,
          rejectedByName: cleanText(req.authUser?.name) || actorName || "User",
          rejectedByEmail: cleanText(req.authUser?.email) || "",
          rejectNote: notification.rejectNote,
        });
      }
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : "Unknown mail error";
      console.error(`[MAILER] Gagal kirim notifikasi flow reject ke admin: ${message}`);
    }

    res.json({ data: updated, message: "Penolakan perangkat berhasil disimpan." });
  } catch (error) {
    if (error instanceof Error && error.message === "DATA_PERANGKAT_NOT_FOUND") {
      return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_JOB_CODE_NOT_FOUND") {
      return res.status(403).json({ message: "Department user tidak ditemukan. Hubungi admin." });
    }

    if (error instanceof Error && error.message === "ROLE_USER_SCOPE_FORBIDDEN") {
      return res.status(403).json({ message: "Role user tidak diizinkan mengakses data perangkat di Department lain." });
    }

    if (error instanceof Error && error.message === "FLOW_ASSIGNEE_FORBIDDEN") {
      return res.status(403).json({ message: "Perangkat ini di-assign ke PIC lain, akun ini tidak bisa melakukan konfirmasi." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

deviceRecordRouter.post("/device-records/:id/flow/resubmit", requireRole("admin"), async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const payload = parseFlowActionPayload(req.body);
    const actorName = getHistoryActorName(req);
    const note = cleanText(payload.note);

    const resubmittedResult = await prisma.$transaction(async (tx) => {
      const existing = await tx.device.findUnique({
        where: { id },
        select: {
          id: true,
          flowStatus: true,
          flowSubmittedByUserId: true,
          flowAssignedPicUserId: true,
          serialNumber: true,
          hostName: true,
          category: {
            select: { name: true },
          },
          model: {
            select: { name: true },
          },
          jobCode: {
            select: { code: true },
          },
          departmentJobCode: {
            select: { code: true },
          },
        },
      });

      if (!existing) {
        throw new Error("DATA_PERANGKAT_NOT_FOUND");
      }

      if (cleanText(existing.flowStatus) !== DEVICE_FLOW_STATUS_REJECTED) {
        throw new Error("Hanya data berstatus REJECTED yang bisa dikirim ulang.");
      }

      const currentUserId = cleanText(req.authUser?.id);
      const submittedByUserId = cleanText(existing.flowSubmittedByUserId);
      if (!currentUserId || !submittedByUserId || submittedByUserId !== currentUserId) {
        throw new Error("FLOW_RESUBMIT_SENDER_ONLY");
      }

      await tx.device.update({
        where: { id },
        data: {
          flowStatus: DEVICE_FLOW_STATUS_PENDING,
          flowRejectedByUserId: null,
          flowRejectedAt: null,
          flowRejectNote: null,
          flowApprovedByUserId: null,
          flowApprovedAt: null,
          flowRecipientSignature: null,
          flowSenderSignature: null,
          flowSenderSignedByUserId: null,
          flowSenderSignedAt: null,
        },
      });

      const historyMessage = note
        ? `Flow perangkat dikirim ulang oleh ${actorName}. Catatan admin: ${note}`
        : `Flow perangkat dikirim ulang oleh ${actorName}.`;

      await appendLatestLeaseHistory(
        tx,
        id,
        `${historyMessage}${existing.serialNumber ? ` (Serial No: ${existing.serialNumber})` : ""}`,
      );

      const mappedDevice = await getMappedDeviceById(tx, id);
      const recipientUserId = cleanText(existing.flowAssignedPicUserId);
      const recipientUser = recipientUserId
        ? await tx.masterUser.findUnique({
          where: { id: recipientUserId },
          select: {
            name: true,
            email: true,
          },
        })
        : null;

      return {
        mappedDevice,
        notification: {
          recipientName: cleanText(recipientUser?.name),
          recipientEmail: cleanText(recipientUser?.email),
          departmentCode: cleanText(existing.jobCode?.code),
          siteCode: cleanText(existing.departmentJobCode?.code),
          serialNo: cleanText(existing.serialNumber),
          category: cleanText(existing.category?.name),
          model: cleanText(existing.model?.name),
          hostName: cleanText(existing.hostName),
        },
      };
    });

    const updated = resubmittedResult.mappedDevice;
    try {
      await sendDeviceFlowPendingEmail({
        ...resubmittedResult.notification,
        submittedByName: cleanText(req.authUser?.name) || actorName || "Admin",
        submittedByEmail: cleanText(req.authUser?.email) || "",
      });
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message : "Unknown mail error";
      console.error(`[MAILER] Gagal kirim notifikasi flow resubmit ke user: ${message}`);
    }

    res.json({ data: updated, message: "Data berhasil dikirim ulang untuk konfirmasi user." });
  } catch (error) {
    if (error instanceof Error && error.message === "DATA_PERANGKAT_NOT_FOUND") {
      return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "FLOW_RESUBMIT_SENDER_ONLY") {
      return res.status(403).json({ message: "Hanya admin pengirim data perangkat yang dapat melakukan resubmit." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

deviceRecordRouter.post("/device-records/:id/flow/sender-signature", requireRole("admin"), async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const payload = parseFlowActionPayload(req.body, { requireSignature: true });
    const actorName = getHistoryActorName(req);
    const signerName = cleanText(req.authUser?.name) || actorName || "Admin";
    const signerEmail = cleanText(req.authUser?.email) || "";

    const senderSignedResult = await prisma.$transaction(async (tx) => {
      const signedAt = new Date();
      const existing = await tx.device.findUnique({
        where: { id },
        select: {
          id: true,
          flowStatus: true,
          flowSenderSignature: true,
          flowApprovedByUserId: true,
          flowAssignedPicUserId: true,
          flowApprovedAt: true,
          flowRecipientSignature: true,
          serialNumber: true,
          hostName: true,
          picNameRaw: true,
          userNameRaw: true,
          category: {
            select: { name: true },
          },
          model: {
            select: { name: true },
          },
          jobCode: {
            select: { code: true },
          },
          departmentJobCode: {
            select: { code: true },
          },
        },
      });

      if (!existing) {
        throw new Error("DATA_PERANGKAT_NOT_FOUND");
      }

      if (cleanText(existing.flowStatus) !== DEVICE_FLOW_STATUS_APPROVED) {
        throw new Error("Tanda tangan pengirim hanya bisa disimpan untuk data APPROVED.");
      }

      const shouldSendNotification = !cleanText(existing.flowSenderSignature);
      await tx.device.update({
        where: { id },
        data: {
          flowSenderSignature: payload.signatureDataUrl,
          flowSenderSignedByUserId: cleanText(req.authUser?.id) || null,
          flowSenderSignedAt: signedAt,
        },
      });

      await appendLatestLeaseHistory(
        tx,
        id,
        `Tanda tangan pengirim BAST diperbarui oleh ${actorName}${existing.serialNumber ? ` (Serial No: ${existing.serialNumber})` : ""}.`,
      );

      const mappedDevice = await getMappedDeviceById(tx, id);
      if (!shouldSendNotification) {
        return {
          mappedDevice,
          notification: null,
        };
      }

      const approvedUserId = cleanText(existing.flowApprovedByUserId);
      const assignedUserId = cleanText(existing.flowAssignedPicUserId);
      const recipientUserId = approvedUserId || assignedUserId;
      const recipientUser = recipientUserId
        ? await tx.masterUser.findUnique({
          where: { id: recipientUserId },
          select: {
            name: true,
            email: true,
            jobCode: {
              select: {
                code: true,
              },
            },
          },
        })
        : null;

      const signerUserId = cleanText(req.authUser?.id);
      const signerUser = signerUserId
        ? await tx.masterUser.findUnique({
          where: { id: signerUserId },
          select: {
            name: true,
            email: true,
            jobCode: {
              select: {
                code: true,
              },
            },
          },
        })
        : null;

      return {
        mappedDevice,
        notification: {
          recipientName: cleanText(recipientUser?.name) || cleanText(existing.picNameRaw) || cleanText(existing.userNameRaw),
          recipientEmail: cleanText(recipientUser?.email),
          senderName: cleanText(signerUser?.name) || signerName,
          senderDepartment: cleanText(signerUser?.jobCode?.code) || cleanText(existing.jobCode?.code),
          receiverName: cleanText(recipientUser?.name) || cleanText(existing.picNameRaw) || cleanText(existing.userNameRaw),
          receiverDepartment: cleanText(recipientUser?.jobCode?.code) || cleanText(existing.jobCode?.code),
          departmentCode: cleanText(existing.jobCode?.code),
          siteCode: cleanText(existing.departmentJobCode?.code),
          serialNo: cleanText(existing.serialNumber),
          category: cleanText(existing.category?.name),
          model: cleanText(existing.model?.name),
          hostName: cleanText(existing.hostName),
          approvedAt: existing.flowApprovedAt ?? signedAt,
          senderSignatureDataUrl: cleanText(payload.signatureDataUrl),
          receiverSignatureDataUrl: cleanText(existing.flowRecipientSignature),
        },
      };
    });

    const updated = senderSignedResult.mappedDevice;
    const notification = senderSignedResult.notification;
    if (notification && cleanText(notification.recipientEmail)) {
      try {
        const safeSerial = cleanText(notification.serialNo).replace(/[^A-Za-z0-9._-]+/g, "-");
        const bastFileName = `BAST-${safeSerial || "device"}.pdf`;
        const bastPdfBuffer = await createBastPdfBuffer({
          approvedAt: notification.approvedAt,
          senderName: cleanText(notification.senderName),
          senderDepartment: cleanText(notification.senderDepartment),
          receiverName: cleanText(notification.receiverName),
          receiverDepartment: cleanText(notification.receiverDepartment),
          department: cleanText(notification.departmentCode),
          serialNo: cleanText(notification.serialNo),
          category: cleanText(notification.category),
          model: cleanText(notification.model),
          hostName: cleanText(notification.hostName),
          senderSignatureDataUrl: cleanText(notification.senderSignatureDataUrl),
          receiverSignatureDataUrl: cleanText(notification.receiverSignatureDataUrl),
        });

        await sendDeviceFlowSenderSignedBastEmail({
          recipientName: cleanText(notification.recipientName) || "User",
          recipientEmail: cleanText(notification.recipientEmail),
          departmentCode: cleanText(notification.departmentCode),
          siteCode: cleanText(notification.siteCode),
          serialNo: cleanText(notification.serialNo),
          category: cleanText(notification.category),
          model: cleanText(notification.model),
          hostName: cleanText(notification.hostName),
          signedByName: signerName,
          signedByEmail: signerEmail,
          bastFileName,
          bastPdfBuffer,
        });
      } catch (mailError) {
        const message = mailError instanceof Error ? mailError.message : "Unknown mail error";
        console.error(`[MAILER] Gagal kirim notifikasi TTD pengirim ke user: ${message}`);
      }
    }

    res.json({ data: updated, message: "Tanda tangan pengirim berhasil disimpan." });
  } catch (error) {
    if (error instanceof Error && error.message === "DATA_PERANGKAT_NOT_FOUND") {
      return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

deviceRecordRouter.post("/device-records/:id/back-to-kddi", requireRole("admin"), async (req, res, next) => {
  try {
    const id = cleanText(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID tidak valid." });
    }

    const actorName = getHistoryActorName(req);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.device.findUnique({
        where: { id },
        select: {
          id: true,
          serialNumber: true,
          leaseContracts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              leaseStatus: true,
              historyLog: true,
            },
          },
        },
      });

      if (!existing) {
        throw new Error("DATA_PERANGKAT_NOT_FOUND");
      }

      const latestLease = existing.leaseContracts[0] ?? null;
      if (!latestLease) {
        throw new Error("LEASE_CONTRACT_NOT_FOUND");
      }

      if (isBackToKddiLeaseStatus(latestLease.leaseStatus)) {
        throw new Error("LEASE_STATUS_ALREADY_BACK_TO_KDDI");
      }

      const updatedHistoryLog = appendHistoryEntries(
        latestLease.historyLog,
        [
          buildHistoryEntry(
            `Lease Status diubah menjadi Back To KDDI oleh ${actorName}${existing.serialNumber ? ` (Serial No: ${existing.serialNumber})` : ""}.`,
          ),
        ],
      );

      await tx.leaseContract.update({
        where: { id: latestLease.id },
        data: {
          leaseStatus: "Back To KDDI",
          historyLog: updatedHistoryLog,
        },
      });

      return getMappedDeviceById(tx, id);
    });

    res.json({ data: updated, message: "Lease Status berhasil diubah menjadi Back To KDDI." });
  } catch (error) {
    if (error instanceof Error && error.message === "DATA_PERANGKAT_NOT_FOUND") {
      return res.status(404).json({ message: "Data perangkat tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "LEASE_CONTRACT_NOT_FOUND") {
      return res.status(400).json({ message: "Data lease perangkat tidak ditemukan." });
    }

    if (error instanceof Error && error.message === "LEASE_STATUS_ALREADY_BACK_TO_KDDI") {
      return res.status(400).json({ message: "Lease Status sudah Back To KDDI." });
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
