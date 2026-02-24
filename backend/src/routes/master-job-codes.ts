import { Prisma } from "@prisma/client";
import multer from "multer";
import { type Request, type Response, Router } from "express";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/auth";

export const masterJobCodeRouter = Router();

const TEMPLATE_HEADERS = ["Job Code", "Site Name", "Address", "Telp. Number"] as const;
const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMPORT_FILE_SIZE,
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

type JobCodePayload = {
  code: string;
  siteName: string;
  address: string;
  phoneNumber: string;
};

type ParsedImportRow = JobCodePayload & {
  rowNumber: number;
};

function normalizeHeaderText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function ensureTemplateHeader(headerRow: unknown[]): void {
  const normalizedHeaders = TEMPLATE_HEADERS.map((header) => normalizeHeaderText(header));
  const actualHeaders = headerRow.slice(0, TEMPLATE_HEADERS.length).map(normalizeHeaderText);

  const isMatch = normalizedHeaders.every((header, index) => header === actualHeaders[index]);
  if (!isMatch) {
    throw new Error(`Header template tidak sesuai. Gunakan urutan: ${TEMPLATE_HEADERS.join(", ")}`);
  }
}

function parseImportRows(sheet: XLSX.WorkSheet): ParsedImportRow[] {
  const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (!sheetRows.length) {
    throw new Error("File Excel kosong.");
  }

  const [firstRow, ...dataRows] = sheetRows;
  const headerRow = Array.isArray(firstRow) ? firstRow : [];
  ensureTemplateHeader(headerRow);

  const parsedRows: ParsedImportRow[] = [];
  const rowErrors: string[] = [];
  const seenCodes = new Set<string>();

  dataRows.forEach((rawRow, index) => {
    if (!Array.isArray(rawRow)) {
      return;
    }

    const rowNumber = index + 2;
    const [codeRaw, siteNameRaw, addressRaw, phoneNumberRaw] = rawRow;
    const rowValues = [codeRaw, siteNameRaw, addressRaw, phoneNumberRaw];
    const isEmptyRow = rowValues.every((value) => String(value ?? "").trim() === "");

    if (isEmptyRow) {
      return;
    }

    try {
      const payload = parsePayload({
        code: codeRaw,
        siteName: siteNameRaw,
        address: addressRaw,
        phoneNumber: phoneNumberRaw,
      });

      if (seenCodes.has(payload.code)) {
        throw new Error("Job Code duplikat di file import.");
      }

      seenCodes.add(payload.code);
      parsedRows.push({
        ...payload,
        rowNumber,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Data tidak valid.";
      rowErrors.push(`Baris ${rowNumber}: ${message}`);
    }
  });

  if (rowErrors.length > 0) {
    throw new Error(`Validasi import gagal.\n${rowErrors.join("\n")}`);
  }

  if (!parsedRows.length) {
    throw new Error("Tidak ada data yang bisa diimport.");
  }

  return parsedRows;
}

function createTemplateWorkbookBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  const templateSheet = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_HEADERS],
    ["CLC", "Cikarang", "Cikarang", "021-5555-1234"],
  ]);

  templateSheet["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 40 }, { wch: 22 }];

  const instructionSheet = XLSX.utils.aoa_to_sheet([
    ["Panduan Import Master Job Code"],
    ["1. Isi data mulai baris ke-2 di sheet Template."],
    ["2. Kolom wajib: Job Code, Site Name, Address, Telp. Number."],
    ["3. Job Code harus 1-5 huruf (A-Z)."],
    ["4. Site Name maksimal 30 karakter, Telp. Number maksimal 30 karakter."],
    ["5. Jika Job Code sudah ada, data akan diupdate saat import."],
  ]);

  instructionSheet["!cols"] = [{ wch: 90 }];

  XLSX.utils.book_append_sheet(workbook, templateSheet, "Template");
  XLSX.utils.book_append_sheet(workbook, instructionSheet, "Instruksi");

  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}

function runImportUpload(req: Request, res: Response): Promise<void> {
  const uploadMiddleware = importUpload.single("file");

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

masterJobCodeRouter.get("/master-job-codes/template", requireRole("admin"), async (_req, res, next) => {
  try {
    const buffer = createTemplateWorkbookBuffer();
    const filename = "template-master-job-code.xlsx";

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

masterJobCodeRouter.post("/master-job-codes/import", requireRole("admin"), async (req, res, next) => {
  try {
    await runImportUpload(req, res);

    if (!req.file) {
      return res.status(400).json({ message: "File Excel wajib diupload." });
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: "buffer", raw: false });
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

    const parsedRows = parseImportRows(firstSheet);
    const codes = parsedRows.map((row) => row.code);

    const existingRows = await prisma.jobCode.findMany({
      where: {
        code: {
          in: codes,
        },
      },
      select: {
        code: true,
      },
    });

    const existingCodeSet = new Set(existingRows.map((row) => row.code));

    await prisma.$transaction(async (tx) => {
      for (const row of parsedRows) {
        await tx.jobCode.upsert({
          where: { code: row.code },
          update: {
            siteName: row.siteName,
            address: row.address,
            phoneNumber: row.phoneNumber,
          },
          create: {
            code: row.code,
            siteName: row.siteName,
            address: row.address,
            phoneNumber: row.phoneNumber,
          },
        });
      }
    });

    const created = parsedRows.filter((row) => !existingCodeSet.has(row.code)).length;
    const updated = parsedRows.length - created;

    res.json({
      message: "Import Master Job Code berhasil.",
      data: {
        total: parsedRows.length,
        created,
        updated,
      },
    });
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: `Ukuran file maksimal ${Math.floor(MAX_IMPORT_FILE_SIZE / (1024 * 1024))} MB.`,
      });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

masterJobCodeRouter.post("/master-job-codes", requireRole("admin"), async (req, res, next) => {
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

masterJobCodeRouter.put("/master-job-codes/:id", requireRole("admin"), async (req, res, next) => {
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

masterJobCodeRouter.delete("/master-job-codes/:id", requireRole("admin"), async (req, res, next) => {
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
