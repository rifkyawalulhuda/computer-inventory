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
    "Email ini dibuat otomatis oleh sistem Computer Inventory.",
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
      <p style="color:#64748b;font-size:12px;">Email ini dibuat otomatis oleh sistem Computer Inventory.</p>
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
    "Email ini dibuat otomatis oleh sistem Computer Inventory.",
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
      <p style="color:#64748b;font-size:12px;">Email ini dibuat otomatis oleh sistem Computer Inventory.</p>
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
