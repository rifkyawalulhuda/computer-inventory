import nodemailer, { type Transporter } from "nodemailer";

type DeviceFlowPendingEmailPayload = {
  recipientName: string;
  recipientEmail: string;
  departmentCode: string;
  siteCode: string;
  serialNo: string;
  category: string;
  model: string;
  hostName: string;
  submittedByName: string;
  submittedByEmail: string;
};

type DeviceFlowRejectedEmailPayload = {
  recipientName: string;
  recipientEmail: string;
  departmentCode: string;
  siteCode: string;
  serialNo: string;
  category: string;
  model: string;
  hostName: string;
  rejectedByName: string;
  rejectedByEmail: string;
  rejectNote: string;
};

type DeviceFlowApprovedBastEmailPayload = {
  recipientName: string;
  recipientEmail: string;
  departmentCode: string;
  siteCode: string;
  serialNo: string;
  category: string;
  model: string;
  hostName: string;
  approvedByName: string;
  approvedByEmail: string;
  bastFileName: string;
  bastPdfBuffer: Buffer;
};

type DeviceFlowSenderSignedBastEmailPayload = {
  recipientName: string;
  recipientEmail: string;
  departmentCode: string;
  siteCode: string;
  serialNo: string;
  category: string;
  model: string;
  hostName: string;
  signedByName: string;
  signedByEmail: string;
  bastFileName: string;
  bastPdfBuffer: Buffer;
};

type DeviceChangeRequestReviewEmailPayload = {
  recipientName: string;
  recipientEmail: string;
  requestTypeLabel: string;
  currentStepLabel: string;
  serialNo: string;
  category: string;
  model: string;
  hostName: string;
  departmentCode: string;
  jobCode: string;
  requesterName: string;
  requesterEmail: string;
  requestedNote: string;
};

type DeviceChangeRequestRejectedEmailPayload = {
  recipientName: string;
  recipientEmail: string;
  requestTypeLabel: string;
  serialNo: string;
  category: string;
  model: string;
  hostName: string;
  departmentCode: string;
  jobCode: string;
  rejectedByName: string;
  rejectedByEmail: string;
  rejectNote: string;
};

type DeviceChangeRequestCompletedEmailPayload = {
  recipientName: string;
  recipientEmail: string;
  requestTypeLabel: string;
  serialNo: string;
  category: string;
  model: string;
  hostName: string;
  departmentCode: string;
  jobCode: string;
  targetDepartmentCode: string;
  targetJobCode: string;
  approvedByName: string;
  approvedByEmail: string;
};

type SmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  appUrl: string;
};

let cachedTransporter: Transporter | null = null;
let cachedTransporterKey = "";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: unknown): boolean {
  const text = cleanText(value).toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on";
}

function getSmtpConfig(): SmtpConfig {
  const host = cleanText(process.env.SMTP_HOST);
  const port = Number(cleanText(process.env.SMTP_PORT) || "587");
  const secure = parseBoolean(process.env.SMTP_SECURE);
  const user = cleanText(process.env.SMTP_USER);
  const pass = cleanText(process.env.SMTP_PASS);
  const fromEmail = cleanText(process.env.SMTP_FROM_EMAIL) || user;
  const fromName = cleanText(process.env.SMTP_FROM_NAME) || "Computer Inventory";
  const appUrl = cleanText(process.env.APP_WEB_BASE_URL) || "http://localhost:88/index.html";
  const enabled = parseBoolean(process.env.MAIL_NOTIFICATIONS_ENABLED)
    && Boolean(host && Number.isFinite(port) && port > 0 && fromEmail);

  return {
    enabled,
    host,
    port,
    secure,
    user,
    pass,
    fromEmail,
    fromName,
    appUrl,
  };
}

function getTransporter(config: SmtpConfig): Transporter {
  const cacheKey = [
    config.host,
    config.port,
    config.secure ? "secure" : "insecure",
    config.user,
    config.pass,
  ].join("|");

  if (cachedTransporter && cachedTransporterKey === cacheKey) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user || config.pass
      ? {
        user: config.user,
        pass: config.pass,
      }
      : undefined,
  });
  cachedTransporterKey = cacheKey;
  return cachedTransporter;
}

function toSafeValue(value: string): string {
  const text = cleanText(value);
  return text || "-";
}

function stripHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendDeviceFlowPendingEmail(payload: DeviceFlowPendingEmailPayload): Promise<void> {
  const config = getSmtpConfig();
  const recipientEmail = cleanText(payload.recipientEmail);
  if (!config.enabled || !recipientEmail) {
    return;
  }

  const recipientName = toSafeValue(payload.recipientName);
  const departmentCode = toSafeValue(payload.departmentCode);
  const siteCode = toSafeValue(payload.siteCode);
  const serialNo = toSafeValue(payload.serialNo);
  const category = toSafeValue(payload.category);
  const model = toSafeValue(payload.model);
  const hostName = toSafeValue(payload.hostName);
  const submittedByName = toSafeValue(payload.submittedByName);
  const submittedByEmail = toSafeValue(payload.submittedByEmail);
  const flowUrl = config.appUrl;

  const subject = `[Computer Inventory] Persetujuan Perangkat Baru - ${serialNo}`;
  const text = [
    `Halo ${recipientName},`,
    "",
    "Ada data perangkat baru yang perlu Anda konfirmasi di Flow Proses.",
    `Department: ${departmentCode}`,
    `Job Code: ${siteCode}`,
    `Serial No: ${serialNo}`,
    `Category: ${category}`,
    `Model: ${model}`,
    `Host Name: ${hostName}`,
    `Dikirim oleh: ${submittedByName} (${submittedByEmail})`,
    "",
    `Buka aplikasi: ${flowUrl}`,
    "",
    "Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <p>Halo <strong>${stripHtml(recipientName)}</strong>,</p>
      <p>Ada data perangkat baru yang perlu Anda konfirmasi di <strong>Flow Proses</strong>.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
        <tbody>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Department</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(departmentCode)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Job Code</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(siteCode)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Serial No.</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(serialNo)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(category)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Model</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(model)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Host Name</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(hostName)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Dikirim oleh</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(submittedByName)} (${stripHtml(submittedByEmail)})</td></tr>
        </tbody>
      </table>
      <p style="margin-top: 16px;">
        <a href="${stripHtml(flowUrl)}" style="display:inline-block;padding:10px 14px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
          Buka Flow Proses
        </a>
      </p>
      <p style="color:#64748b;font-size:12px;">Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.</p>
    </div>
  `;

  const transporter = getTransporter(config);
  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendDeviceFlowRejectedEmail(payload: DeviceFlowRejectedEmailPayload): Promise<void> {
  const config = getSmtpConfig();
  const recipientEmail = cleanText(payload.recipientEmail);
  if (!config.enabled || !recipientEmail) {
    return;
  }

  const recipientName = toSafeValue(payload.recipientName);
  const departmentCode = toSafeValue(payload.departmentCode);
  const siteCode = toSafeValue(payload.siteCode);
  const serialNo = toSafeValue(payload.serialNo);
  const category = toSafeValue(payload.category);
  const model = toSafeValue(payload.model);
  const hostName = toSafeValue(payload.hostName);
  const rejectedByName = toSafeValue(payload.rejectedByName);
  const rejectedByEmail = toSafeValue(payload.rejectedByEmail);
  const rejectNote = toSafeValue(payload.rejectNote);
  const flowUrl = config.appUrl;

  const subject = `[Computer Inventory] Data Perangkat Ditolak - ${serialNo}`;
  const text = [
    `Halo ${recipientName},`,
    "",
    "Data perangkat berikut ditolak oleh user/PIC dan membutuhkan revisi:",
    `Department: ${departmentCode}`,
    `Job Code: ${siteCode}`,
    `Serial No: ${serialNo}`,
    `Category: ${category}`,
    `Model: ${model}`,
    `Host Name: ${hostName}`,
    `Ditolak oleh: ${rejectedByName} (${rejectedByEmail})`,
    `Alasan reject: ${rejectNote}`,
    "",
    `Buka Flow Proses: ${flowUrl}`,
    "",
    "Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <p>Halo <strong>${stripHtml(recipientName)}</strong>,</p>
      <p>Data perangkat berikut ditolak oleh user/PIC dan membutuhkan revisi:</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
        <tbody>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Department</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(departmentCode)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Job Code</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(siteCode)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Serial No.</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(serialNo)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(category)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Model</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(model)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Host Name</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(hostName)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Ditolak oleh</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(rejectedByName)} (${stripHtml(rejectedByEmail)})</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Alasan Reject</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(rejectNote)}</td></tr>
        </tbody>
      </table>
      <p style="margin-top: 16px;">
        <a href="${stripHtml(flowUrl)}" style="display:inline-block;padding:10px 14px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
          Buka Flow Proses
        </a>
      </p>
      <p style="color:#64748b;font-size:12px;">Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.</p>
    </div>
  `;

  const transporter = getTransporter(config);
  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendDeviceFlowApprovedBastEmail(
  payload: DeviceFlowApprovedBastEmailPayload,
): Promise<void> {
  const config = getSmtpConfig();
  const recipientEmail = cleanText(payload.recipientEmail);
  if (!config.enabled || !recipientEmail || !Buffer.isBuffer(payload.bastPdfBuffer) || payload.bastPdfBuffer.length === 0) {
    return;
  }

  const recipientName = toSafeValue(payload.recipientName);
  const departmentCode = toSafeValue(payload.departmentCode);
  const siteCode = toSafeValue(payload.siteCode);
  const serialNo = toSafeValue(payload.serialNo);
  const category = toSafeValue(payload.category);
  const model = toSafeValue(payload.model);
  const hostName = toSafeValue(payload.hostName);
  const approvedByName = toSafeValue(payload.approvedByName);
  const approvedByEmail = toSafeValue(payload.approvedByEmail);
  const flowUrl = config.appUrl;
  const bastFileName = cleanText(payload.bastFileName) || `BAST-${serialNo}.pdf`;

  const subject = `[Computer Inventory] Perangkat Disetujui + Lampiran BAST - ${serialNo}`;
  const text = [
    `Halo ${recipientName},`,
    "",
    "Perangkat berikut sudah disetujui user/PIC.",
    `Department: ${departmentCode}`,
    `Job Code: ${siteCode}`,
    `Serial No: ${serialNo}`,
    `Category: ${category}`,
    `Model: ${model}`,
    `Host Name: ${hostName}`,
    `Disetujui oleh: ${approvedByName} (${approvedByEmail})`,
    "",
    `Lampiran: ${bastFileName}`,
    `Buka Flow Proses: ${flowUrl}`,
    "",
    "Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <p>Halo <strong>${stripHtml(recipientName)}</strong>,</p>
      <p>Perangkat berikut sudah disetujui user/PIC. Dokumen BAST terlampir pada email ini.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
        <tbody>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Department</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(departmentCode)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Job Code</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(siteCode)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Serial No.</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(serialNo)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(category)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Model</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(model)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Host Name</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(hostName)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Disetujui oleh</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(approvedByName)} (${stripHtml(approvedByEmail)})</td></tr>
        </tbody>
      </table>
      <p style="margin-top: 16px;">
        <a href="${stripHtml(flowUrl)}" style="display:inline-block;padding:10px 14px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
          Buka Flow Proses
        </a>
      </p>
      <p style="color:#64748b;font-size:12px;">Lampiran: ${stripHtml(bastFileName)}</p>
      <p style="color:#64748b;font-size:12px;">Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.</p>
    </div>
  `;

  const transporter = getTransporter(config);
  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: recipientEmail,
    subject,
    text,
    html,
    attachments: [
      {
        filename: bastFileName,
        content: payload.bastPdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendDeviceFlowSenderSignedBastEmail(
  payload: DeviceFlowSenderSignedBastEmailPayload,
): Promise<void> {
  const config = getSmtpConfig();
  const recipientEmail = cleanText(payload.recipientEmail);
  if (!config.enabled || !recipientEmail || !Buffer.isBuffer(payload.bastPdfBuffer) || payload.bastPdfBuffer.length === 0) {
    return;
  }

  const recipientName = toSafeValue(payload.recipientName);
  const departmentCode = toSafeValue(payload.departmentCode);
  const siteCode = toSafeValue(payload.siteCode);
  const serialNo = toSafeValue(payload.serialNo);
  const category = toSafeValue(payload.category);
  const model = toSafeValue(payload.model);
  const hostName = toSafeValue(payload.hostName);
  const signedByName = toSafeValue(payload.signedByName);
  const signedByEmail = toSafeValue(payload.signedByEmail);
  const flowUrl = config.appUrl;
  const bastFileName = cleanText(payload.bastFileName) || `BAST-${serialNo}.pdf`;

  const subject = `[Computer Inventory] BAST Sudah Ditandatangani Admin - ${serialNo}`;
  const text = [
    `Halo ${recipientName},`,
    "",
    "Dokumen BAST perangkat berikut sudah ditandatangani Admin.",
    `Department: ${departmentCode}`,
    `Job Code: ${siteCode}`,
    `Serial No: ${serialNo}`,
    `Category: ${category}`,
    `Model: ${model}`,
    `Host Name: ${hostName}`,
    `Ditandatangani oleh Admin: ${signedByName} (${signedByEmail})`,
    "",
    `Lampiran: ${bastFileName}`,
    `Buka Flow Proses: ${flowUrl}`,
    "",
    "Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <p>Halo <strong>${stripHtml(recipientName)}</strong>,</p>
      <p>Dokumen BAST perangkat berikut sudah ditandatangani Admin. File PDF BAST terlampir pada email ini.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
        <tbody>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Department</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(departmentCode)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Job Code</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(siteCode)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Serial No.</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(serialNo)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(category)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Model</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(model)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Host Name</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(hostName)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Admin Penandatangan</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(signedByName)} (${stripHtml(signedByEmail)})</td></tr>
        </tbody>
      </table>
      <p style="margin-top: 16px;">
        <a href="${stripHtml(flowUrl)}" style="display:inline-block;padding:10px 14px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
          Buka Flow Proses
        </a>
      </p>
      <p style="color:#64748b;font-size:12px;">Lampiran: ${stripHtml(bastFileName)}</p>
      <p style="color:#64748b;font-size:12px;">Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.</p>
    </div>
  `;

  const transporter = getTransporter(config);
  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: recipientEmail,
    subject,
    text,
    html,
    attachments: [
      {
        filename: bastFileName,
        content: payload.bastPdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendDeviceChangeRequestReviewEmail(
  payload: DeviceChangeRequestReviewEmailPayload,
): Promise<void> {
  const config = getSmtpConfig();
  const recipientEmail = cleanText(payload.recipientEmail);
  if (!config.enabled || !recipientEmail) {
    return;
  }

  const recipientName = toSafeValue(payload.recipientName);
  const requestTypeLabel = toSafeValue(payload.requestTypeLabel);
  const currentStepLabel = toSafeValue(payload.currentStepLabel);
  const serialNo = toSafeValue(payload.serialNo);
  const category = toSafeValue(payload.category);
  const model = toSafeValue(payload.model);
  const hostName = toSafeValue(payload.hostName);
  const departmentCode = toSafeValue(payload.departmentCode);
  const jobCode = toSafeValue(payload.jobCode);
  const requesterName = toSafeValue(payload.requesterName);
  const requesterEmail = toSafeValue(payload.requesterEmail);
  const requestedNote = toSafeValue(payload.requestedNote);
  const flowUrl = config.appUrl;

  const subject = `[Computer Inventory] ${requestTypeLabel} - ${serialNo}`;
  const text = [
    `Halo ${recipientName},`,
    "",
    `Ada request ${requestTypeLabel} yang perlu diproses.`,
    `Current Step: ${currentStepLabel}`,
    `Department: ${departmentCode}`,
    `Job Code: ${jobCode}`,
    `Serial No: ${serialNo}`,
    `Category: ${category}`,
    `Model: ${model}`,
    `Host Name: ${hostName}`,
    `Requester: ${requesterName} (${requesterEmail})`,
    `Keterangan: ${requestedNote}`,
    "",
    `Buka Flow Proses: ${flowUrl}`,
    "",
    "Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <p>Halo <strong>${stripHtml(recipientName)}</strong>,</p>
      <p>Ada request <strong>${stripHtml(requestTypeLabel)}</strong> yang perlu diproses.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
        <tbody>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Current Step</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(currentStepLabel)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Department</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(departmentCode)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Job Code</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(jobCode)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Serial No.</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(serialNo)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(category)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Model</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(model)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Host Name</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(hostName)}</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Requester</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(requesterName)} (${stripHtml(requesterEmail)})</td></tr>
          <tr><td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>Keterangan</strong></td><td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${stripHtml(requestedNote)}</td></tr>
        </tbody>
      </table>
      <p style="margin-top: 16px;">
        <a href="${stripHtml(flowUrl)}" style="display:inline-block;padding:10px 14px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">Buka Flow Proses</a>
      </p>
      <p style="color:#64748b;font-size:12px;">Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.</p>
    </div>
  `;

  const transporter = getTransporter(config);
  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendDeviceChangeRequestRejectedEmail(
  payload: DeviceChangeRequestRejectedEmailPayload,
): Promise<void> {
  const config = getSmtpConfig();
  const recipientEmail = cleanText(payload.recipientEmail);
  if (!config.enabled || !recipientEmail) {
    return;
  }

  const recipientName = toSafeValue(payload.recipientName);
  const requestTypeLabel = toSafeValue(payload.requestTypeLabel);
  const serialNo = toSafeValue(payload.serialNo);
  const category = toSafeValue(payload.category);
  const model = toSafeValue(payload.model);
  const hostName = toSafeValue(payload.hostName);
  const departmentCode = toSafeValue(payload.departmentCode);
  const jobCode = toSafeValue(payload.jobCode);
  const rejectedByName = toSafeValue(payload.rejectedByName);
  const rejectedByEmail = toSafeValue(payload.rejectedByEmail);
  const rejectNote = toSafeValue(payload.rejectNote);
  const flowUrl = config.appUrl;

  const subject = `[Computer Inventory] ${requestTypeLabel} Ditolak - ${serialNo}`;
  const text = [
    `Halo ${recipientName},`,
    "",
    `Request ${requestTypeLabel} ditolak.`,
    `Department: ${departmentCode}`,
    `Job Code: ${jobCode}`,
    `Serial No: ${serialNo}`,
    `Category: ${category}`,
    `Model: ${model}`,
    `Host Name: ${hostName}`,
    `Ditolak oleh: ${rejectedByName} (${rejectedByEmail})`,
    `Alasan reject: ${rejectNote}`,
    "",
    `Buka Flow Proses: ${flowUrl}`,
    "",
    "Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.",
  ].join("\n");

  const transporter = getTransporter(config);
  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: recipientEmail,
    subject,
    text,
    html: `<div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <p>Halo <strong>${stripHtml(recipientName)}</strong>,</p>
      <p>Request <strong>${stripHtml(requestTypeLabel)}</strong> ditolak.</p>
      <p>Alasan reject: <strong>${stripHtml(rejectNote)}</strong></p>
      <p>Perangkat: ${stripHtml(serialNo)} / ${stripHtml(category)} / ${stripHtml(model)} / ${stripHtml(hostName)}</p>
      <p>Department: ${stripHtml(departmentCode)} | Job Code: ${stripHtml(jobCode)}</p>
      <p>Ditolak oleh: ${stripHtml(rejectedByName)} (${stripHtml(rejectedByEmail)})</p>
      <p><a href="${stripHtml(flowUrl)}">Buka Flow Proses</a></p>
      <p style="color:#64748b;font-size:12px;">Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.</p>
    </div>`,
  });
}

export async function sendDeviceChangeRequestCompletedEmail(
  payload: DeviceChangeRequestCompletedEmailPayload,
): Promise<void> {
  const config = getSmtpConfig();
  const recipientEmail = cleanText(payload.recipientEmail);
  if (!config.enabled || !recipientEmail) {
    return;
  }

  const recipientName = toSafeValue(payload.recipientName);
  const requestTypeLabel = toSafeValue(payload.requestTypeLabel);
  const serialNo = toSafeValue(payload.serialNo);
  const category = toSafeValue(payload.category);
  const model = toSafeValue(payload.model);
  const hostName = toSafeValue(payload.hostName);
  const departmentCode = toSafeValue(payload.departmentCode);
  const jobCode = toSafeValue(payload.jobCode);
  const targetDepartmentCode = toSafeValue(payload.targetDepartmentCode);
  const targetJobCode = toSafeValue(payload.targetJobCode);
  const approvedByName = toSafeValue(payload.approvedByName);
  const approvedByEmail = toSafeValue(payload.approvedByEmail);
  const flowUrl = config.appUrl;

  const subject = `[Computer Inventory] ${requestTypeLabel} Disetujui - ${serialNo}`;
  const text = [
    `Halo ${recipientName},`,
    "",
    `Request ${requestTypeLabel} sudah disetujui.`,
    `Department Saat Ini: ${departmentCode}`,
    `Job Code Saat Ini: ${jobCode}`,
    `Target Department: ${targetDepartmentCode}`,
    `Target Job Code: ${targetJobCode}`,
    `Serial No: ${serialNo}`,
    `Category: ${category}`,
    `Model: ${model}`,
    `Host Name: ${hostName}`,
    `Disetujui oleh: ${approvedByName} (${approvedByEmail})`,
    "",
    `Buka Flow Proses: ${flowUrl}`,
    "",
    "Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.",
  ].join("\n");

  const transporter = getTransporter(config);
  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: recipientEmail,
    subject,
    text,
    html: `<div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <p>Halo <strong>${stripHtml(recipientName)}</strong>,</p>
      <p>Request <strong>${stripHtml(requestTypeLabel)}</strong> sudah disetujui.</p>
      <p>Perangkat: ${stripHtml(serialNo)} / ${stripHtml(category)} / ${stripHtml(model)} / ${stripHtml(hostName)}</p>
      <p>Department Saat Ini: ${stripHtml(departmentCode)} | Job Code Saat Ini: ${stripHtml(jobCode)}</p>
      <p>Target Department: ${stripHtml(targetDepartmentCode)} | Target Job Code: ${stripHtml(targetJobCode)}</p>
      <p>Disetujui oleh: ${stripHtml(approvedByName)} (${stripHtml(approvedByEmail)})</p>
      <p><a href="${stripHtml(flowUrl)}">Buka Flow Proses</a></p>
      <p style="color:#64748b;font-size:12px;">Email ini dibuat otomatis oleh sistem Sankyu Computer Inventory.</p>
    </div>`,
  });
}
