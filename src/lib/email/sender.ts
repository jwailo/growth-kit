import nodemailer from "nodemailer";

export type SendTileEmailInput = {
  to: string;
  firstName: string;
  agencyName: string;
  responseTimeMins: string;
  period: string;
  tileImageUrl: string;
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

export function getSubjectLine(period: string): string {
  return `Your response time in ${period} was incredible`;
}

export function buildEmailHtml(input: {
  firstName: string;
  agencyName: string;
  responseTimeMins: string;
  period: string;
  tileCid: string;
}): string {
  const { firstName, agencyName, responseTimeMins, period, tileCid } = input;

  const professional = `At ${agencyName}, we believe fast communication is the foundation of great property management. Powered by @Ailo, our average response time is ${responseTimeMins} minutes. Your property is in good hands. #propertymanagement #ailo`;
  const conversational = `Ever wonder how fast your property manager responds to your messages? Mine is ${responseTimeMins} minutes on average. Proud to be powered by @Ailo.`;
  const shortCaption = `${responseTimeMins} minute average response time. Not hours. Not days. Minutes. #poweredbyailo`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your response time in ${period}</title>
</head>
<body style="margin:0;padding:0;background-color:#F7F7F7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1C1E26;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#F7F7F7;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:40px 40px 24px 40px;">
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#292B32;">Hi ${firstName},</p>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#292B32;">Your average response time in ${period} was <strong>${responseTimeMins} minutes</strong>. That's genuinely exceptional.</p>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#292B32;">We made you something to share.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 24px 40px;">
              <img src="cid:${tileCid}" alt="Response Time Champion tile for ${firstName}" width="480" style="display:block;max-width:100%;height:auto;border-radius:12px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <p style="margin:0 0 12px 0;font-size:16px;line-height:1.6;color:#292B32;">Feel free to share it on LinkedIn, Instagram, your website, or wherever you'd like. A few caption ideas if they help:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 8px 40px;">
              <div style="background-color:#FEF7F9;border-radius:12px;padding:20px;margin-bottom:12px;">
                <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#EE0B4F;letter-spacing:0.4px;text-transform:uppercase;">Professional</p>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#292B32;">${professional}</p>
              </div>
              <div style="background-color:#FEF7F9;border-radius:12px;padding:20px;margin-bottom:12px;">
                <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#EE0B4F;letter-spacing:0.4px;text-transform:uppercase;">Conversational</p>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#292B32;">${conversational}</p>
              </div>
              <div style="background-color:#FEF7F9;border-radius:12px;padding:20px;margin-bottom:4px;">
                <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#EE0B4F;letter-spacing:0.4px;text-transform:uppercase;">Short</p>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#292B32;">${shortCaption}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 40px 40px;">
              <p style="margin:0 0 8px 0;font-size:16px;line-height:1.6;color:#292B32;">No pressure to post — you've earned the recognition either way.</p>
              <p style="margin:0;font-size:16px;line-height:1.6;color:#292B32;">Thanks for everything you do,<br/>The Ailo Team</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;font-size:12px;color:#9A9BA7;">Powered by Ailo</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildEmailText(input: {
  firstName: string;
  agencyName: string;
  responseTimeMins: string;
  period: string;
}): string {
  const { firstName, agencyName, responseTimeMins, period } = input;
  return `Hi ${firstName},

Your average response time in ${period} was ${responseTimeMins} minutes. That's genuinely exceptional.

We made you something to share — your Response Time Champions tile is attached.

A few caption ideas if they help:

Professional:
At ${agencyName}, we believe fast communication is the foundation of great property management. Powered by @Ailo, our average response time is ${responseTimeMins} minutes. Your property is in good hands. #propertymanagement #ailo

Conversational:
Ever wonder how fast your property manager responds to your messages? Mine is ${responseTimeMins} minutes on average. Proud to be powered by @Ailo.

Short:
${responseTimeMins} minute average response time. Not hours. Not days. Minutes. #poweredbyailo

No pressure to post — you've earned the recognition either way.

Thanks for everything you do,
The Ailo Team
`;
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

    const html = buildEmailHtml({
      firstName: input.firstName,
      agencyName: input.agencyName,
      responseTimeMins: input.responseTimeMins,
      period: input.period,
      tileCid,
    });
    const text = buildEmailText({
      firstName: input.firstName,
      agencyName: input.agencyName,
      responseTimeMins: input.responseTimeMins,
      period: input.period,
    });

    const fromUser = process.env.GMAIL_USER!;
    const info = await transporter.sendMail({
      from: `"Ailo" <${fromUser}>`,
      to: input.to,
      subject: getSubjectLine(input.period),
      text,
      html,
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
