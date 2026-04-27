import nodemailer from "nodemailer";
import {
  buildDownloadLinks,
  buildEmailHtml,
  buildEmailText,
  getSubjectLine,
} from "./format";

export { naturalTime, getSubjectLine } from "./format";

export type SendTileEmailInput = {
  to: string;
  firstName: string;
  agencyName: string;
  responseTimeMins: number;
  period: string;
  tileImageUrl: string;
  tileUrlSquareNamed?: string | null;
  tileUrlIg?: string | null;
  tileUrlIgNamed?: string | null;
  downloadAllUrl?: string | null;
  unsubscribeUrl: string;
};

export type SendTileEmailResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variables",
    );
  }

  cachedTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  return cachedTransporter;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch tile image (${res.status}): ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function sendTileEmail(
  input: SendTileEmailInput,
): Promise<SendTileEmailResult> {
  try {
    const transporter = getTransporter();
    const tileBuffer = await fetchImageBuffer(input.tileImageUrl);
    const tileCid = `tile-${Date.now()}@growth-kit`;

    const downloadLinks = buildDownloadLinks({
      tileUrlSquareNamed: input.tileUrlSquareNamed,
      tileUrlIg: input.tileUrlIg,
      tileUrlIgNamed: input.tileUrlIgNamed,
      downloadAllUrl: input.downloadAllUrl,
    });

    const html = buildEmailHtml({
      firstName: input.firstName,
      agencyName: input.agencyName,
      responseTimeMins: input.responseTimeMins,
      period: input.period,
      tileImageSrc: `cid:${tileCid}`,
      downloadLinks,
      unsubscribeUrl: input.unsubscribeUrl,
    });
    const text = buildEmailText({
      firstName: input.firstName,
      agencyName: input.agencyName,
      responseTimeMins: input.responseTimeMins,
      period: input.period,
      downloadLinks,
      unsubscribeUrl: input.unsubscribeUrl,
    });

    const fromUser = process.env.GMAIL_USER!;
    const info = await transporter.sendMail({
      from: `"Ailo" <${fromUser}>`,
      to: input.to,
      subject: getSubjectLine(input.period),
      text,
      html,
      headers: {
        "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      attachments: [
        {
          filename: `response-time-${input.firstName.toLowerCase()}.png`,
          content: tileBuffer,
          cid: tileCid,
          contentType: "image/png",
        },
      ],
    });

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
