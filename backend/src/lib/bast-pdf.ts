import PDFDocument from "pdfkit";

export type BastPdfPayload = {
  approvedAt: Date;
  senderName: string;
  senderDepartment: string;
  receiverName: string;
  receiverDepartment: string;
  department: string;
  serialNo: string;
  category: string;
  model: string;
  hostName: string;
  senderSignatureDataUrl?: string | null;
  receiverSignatureDataUrl?: string | null;
};

type TableCell = {
  text: string;
  width: number;
  align?: "left" | "center" | "right";
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function toDisplayValue(value: unknown): string {
  const text = cleanText(value);
  return text || "-";
}

function getDayNameIndonesian(day: number): string {
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return dayNames[day] ?? "-";
}

function getMonthNameIndonesian(month: number): string {
  const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return monthNames[month] ?? "-";
}

function formatIndonesianFullDate(date: Date): { dayName: string; fullDate: string } {
  const dayName = getDayNameIndonesian(date.getDay());
  const fullDate = `${date.getDate()} ${getMonthNameIndonesian(date.getMonth())} ${date.getFullYear()}`;
  return { dayName, fullDate };
}

function parseSignatureBuffer(dataUrl: string | null | undefined): Buffer | null {
  const raw = cleanText(dataUrl);
  if (!raw) {
    return null;
  }

  const match = raw.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    return null;
  }

  try {
    const buffer = Buffer.from(match[2], "base64");
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

function drawTableRow(
  doc: any,
  x: number,
  y: number,
  rowHeight: number,
  cells: TableCell[],
  options?: { font?: "Helvetica" | "Helvetica-Bold"; fontSize?: number; fillColor?: string },
): void {
  let cursorX = x;
  doc.lineWidth(0.8);
  doc.strokeColor("#94a3b8");

  cells.forEach((cell) => {
    doc.rect(cursorX, y, cell.width, rowHeight).stroke();
    doc
      .font(options?.font ?? "Helvetica")
      .fontSize(options?.fontSize ?? 10.5)
      .fillColor(options?.fillColor ?? "#0f172a")
      .text(cell.text, cursorX + 6, y + 7, {
        width: cell.width - 12,
        align: cell.align ?? "left",
      });
    cursorX += cell.width;
  });
}

function drawPartyTableCell(
  doc: any,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
): void {
  doc.lineWidth(0.8);
  doc.strokeColor("#94a3b8");
  doc.rect(x, y, width, height).stroke();
  doc.font("Helvetica-Bold").fontSize(10.8).fillColor("#0f172a").text(label, x + 8, y + 7, {
    width: width - 16,
  });
  doc.font("Helvetica").fontSize(11).fillColor("#0f172a").text(value, x + 8, y + 24, {
    width: width - 16,
  });
}

export async function createBastPdfBuffer(payload: BastPdfPayload): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      info: {
        Title: `BAST ${toDisplayValue(payload.serialNo)}`,
        Author: "Computer Inventory",
        Subject: "Berita Acara Serah Terima Perangkat",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;
    const approvedDateInfo = formatIndonesianFullDate(payload.approvedAt);

    const senderName = toDisplayValue(payload.senderName);
    const senderDepartment = toDisplayValue(payload.senderDepartment);
    const receiverName = toDisplayValue(payload.receiverName);
    const receiverDepartment = toDisplayValue(payload.receiverDepartment);
    const department = toDisplayValue(payload.department);
    const serialNo = toDisplayValue(payload.serialNo);
    const category = toDisplayValue(payload.category);
    const model = toDisplayValue(payload.model);
    const hostName = toDisplayValue(payload.hostName);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#0f172a")
      .text("BERITA ACARA SERAH TERIMA PERANGKAT", startX, 40, {
        width: pageWidth,
        align: "center",
      });

    doc
      .font("Helvetica")
      .fontSize(11.5)
      .fillColor("#0f172a")
      .text(
        `Pada hari ${approvedDateInfo.dayName}, tanggal ${approvedDateInfo.fullDate}, telah dilakukan serah terima perangkat dengan detail berikut:`,
        startX,
        82,
        { width: pageWidth, align: "left" },
      );

    const partyTop = 122;
    const partyCellWidth = pageWidth / 2;
    const partyRowHeight = 48;

    drawPartyTableCell(doc, startX, partyTop, partyCellWidth, partyRowHeight, "Nama Pengirim / Admin", senderName);
    drawPartyTableCell(
      doc,
      startX + partyCellWidth,
      partyTop,
      partyCellWidth,
      partyRowHeight,
      "Department Pengirim",
      senderDepartment,
    );
    drawPartyTableCell(
      doc,
      startX,
      partyTop + partyRowHeight,
      partyCellWidth,
      partyRowHeight,
      "Nama Penerima / User",
      receiverName,
    );
    drawPartyTableCell(
      doc,
      startX + partyCellWidth,
      partyTop + partyRowHeight,
      partyCellWidth,
      partyRowHeight,
      "Department Penerima",
      receiverDepartment,
    );

    const deviceTableTop = partyTop + (partyRowHeight * 2) + 12;
    const colWidths = [32, 80, 95, 80, 80, 110, 46];
    const headerCells: TableCell[] = [
      { text: "No", width: colWidths[0] },
      { text: "Department", width: colWidths[1] },
      { text: "Serial No.", width: colWidths[2] },
      { text: "Category", width: colWidths[3] },
      { text: "Model", width: colWidths[4] },
      { text: "Host Name", width: colWidths[5] },
      { text: "Qty", width: colWidths[6] },
    ];
    const dataCells: TableCell[] = [
      { text: "1", width: colWidths[0] },
      { text: department, width: colWidths[1] },
      { text: serialNo, width: colWidths[2] },
      { text: category, width: colWidths[3] },
      { text: model, width: colWidths[4] },
      { text: hostName, width: colWidths[5] },
      { text: "1 Unit", width: colWidths[6] },
    ];

    drawTableRow(doc, startX, deviceTableTop, 30, headerCells, { font: "Helvetica-Bold", fontSize: 10.5 });
    drawTableRow(doc, startX, deviceTableTop + 30, 30, dataCells, { font: "Helvetica", fontSize: 10.8 });

    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor("#475569")
      .text("Dokumen ini dihasilkan oleh sistem Flow Proses Data Perangkat.", startX, deviceTableTop + 70, {
        width: pageWidth,
      });

    const signatureTop = deviceTableTop + 110;
    const signatureGap = 28;
    const signatureColumnWidth = (pageWidth - signatureGap) / 2;
    const signatureBoxWidth = Math.min(220, signatureColumnWidth - 12);
    const signatureBoxHeight = 86;
    const leftSignatureX = startX + ((signatureColumnWidth - signatureBoxWidth) / 2);
    const rightColumnX = startX + signatureColumnWidth + signatureGap;
    const rightSignatureX = rightColumnX + ((signatureColumnWidth - signatureBoxWidth) / 2);

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a");
    doc.text("Pengirim / Admin", startX, signatureTop, { width: signatureColumnWidth, align: "center" });
    doc.text("Penerima / User", rightColumnX, signatureTop, { width: signatureColumnWidth, align: "center" });

    const signatureBoxTop = signatureTop + 20;
    doc.lineWidth(0.8).strokeColor("#94a3b8");
    doc.rect(leftSignatureX, signatureBoxTop, signatureBoxWidth, signatureBoxHeight).stroke();
    doc.rect(rightSignatureX, signatureBoxTop, signatureBoxWidth, signatureBoxHeight).stroke();

    const senderSignature = parseSignatureBuffer(payload.senderSignatureDataUrl);
    const receiverSignature = parseSignatureBuffer(payload.receiverSignatureDataUrl);
    if (senderSignature) {
      doc.image(senderSignature, leftSignatureX + 4, signatureBoxTop + 4, {
        fit: [signatureBoxWidth - 8, signatureBoxHeight - 8],
        align: "center",
        valign: "center",
      });
    }

    if (receiverSignature) {
      doc.image(receiverSignature, rightSignatureX + 4, signatureBoxTop + 4, {
        fit: [signatureBoxWidth - 8, signatureBoxHeight - 8],
        align: "center",
        valign: "center",
      });
    }

    const signatureNameTop = signatureBoxTop + signatureBoxHeight + 10;
    doc.font("Helvetica-Bold").fontSize(11.5).fillColor("#0f172a");
    doc.text(senderName, startX, signatureNameTop, {
      width: signatureColumnWidth,
      align: "center",
    });
    doc.text(receiverName, rightColumnX, signatureNameTop, {
      width: signatureColumnWidth,
      align: "center",
    });

    doc.end();
  });
}
