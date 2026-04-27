export type DownloadLinkName =
  | "tile_square_named"
  | "tile_ig"
  | "tile_ig_named"
  | "download_all";

export type DownloadLink = {
  url: string;
  label: string;
  description: string;
  name: DownloadLinkName;
};

export function getSubjectLine(period: string): string {
  return `Your response time in ${period} was incredible`;
}

export function naturalTime(decimalMins: number): string {
  if (!Number.isFinite(decimalMins) || decimalMins < 1) {
    return "less than a minute";
  }
  let mins = Math.floor(decimalMins);
  let secs = Math.round((decimalMins % 1) * 60);
  if (secs === 60) {
    mins += 1;
    secs = 0;
  }
  const minLabel = mins === 1 ? "minute" : "minutes";
  if (secs === 0) return `${mins} ${minLabel}`;
  const secLabel = secs === 1 ? "second" : "seconds";
  return `${mins} ${minLabel} and ${secs} ${secLabel}`;
}

export function buildDownloadLinks(input: {
  tileUrlSquareNamed?: string | null;
  tileUrlIg?: string | null;
  tileUrlIgNamed?: string | null;
  downloadAllUrl?: string | null;
}): DownloadLink[] {
  const links: DownloadLink[] = [];
  if (input.tileUrlSquareNamed) {
    links.push({
      url: input.tileUrlSquareNamed,
      label: "Square version with your name",
      description: "For when your agency shares it and tags you",
      name: "tile_square_named",
    });
  }
  if (input.tileUrlIg) {
    links.push({
      url: input.tileUrlIg,
      label: "Instagram version",
      description: "Optimised for Instagram feed posts",
      name: "tile_ig",
    });
  }
  if (input.tileUrlIgNamed) {
    links.push({
      url: input.tileUrlIgNamed,
      label: "Instagram version with your name",
      description: "For agency Instagram posts",
      name: "tile_ig_named",
    });
  }
  if (input.downloadAllUrl) {
    links.push({
      url: input.downloadAllUrl,
      label: "Download all versions",
      description: "ZIP with every variant",
      name: "download_all",
    });
  }
  return links;
}

function makeClickWrapper(input: {
  trackingBaseUrl: string;
  recordId: string;
  track: boolean;
}): (url: string, name: string) => string {
  if (!input.track) return (url) => url;
  const { trackingBaseUrl, recordId } = input;
  return (url, name) =>
    `${trackingBaseUrl}/api/track/click/${recordId}?url=${encodeURIComponent(
      url,
    )}&link=${encodeURIComponent(name)}`;
}

export function buildEmailHtml(input: {
  firstName: string;
  agencyName: string;
  responseTimeMins: number;
  period: string;
  tileImageSrc: string;
  downloadLinks: DownloadLink[];
  unsubscribeUrl: string;
  trackingBaseUrl: string;
  recordId: string;
  track?: boolean;
}): string {
  const {
    firstName,
    agencyName,
    responseTimeMins,
    period,
    tileImageSrc,
    downloadLinks,
    unsubscribeUrl,
    trackingBaseUrl,
    recordId,
  } = input;
  const track = input.track ?? true;
  const wrap = makeClickWrapper({ trackingBaseUrl, recordId, track });

  const niceTime = naturalTime(responseTimeMins);

  const professional = `At ${agencyName}, we believe fast communication is the foundation of great property management. Powered by @Ailo, our average response time is ${niceTime}. Your property is in good hands. #propertymanagement #ailo`;
  const conversational = `Ever wonder how fast your property manager responds to your messages? Mine is ${niceTime} on average. Proud to be powered by @Ailo.`;
  const shortCaption = `${niceTime} average response time. Not hours. Not days. Minutes. #poweredbyailo`;

  const downloadLinksHtml =
    downloadLinks.length === 0
      ? ""
      : `<tr>
            <td style="padding:0 40px 24px 40px;">
              <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#9A9BA7;letter-spacing:0.4px;text-transform:uppercase;">Other versions</p>
              ${downloadLinks
                .map(
                  (link) => `<div style="margin-bottom:10px;">
                <a href="${wrap(link.url, link.name)}" style="color:#EE0B4F;text-decoration:none;font-weight:600;font-size:15px;">${link.label} &rarr;</a>
                <p style="margin:2px 0 0 0;font-size:13px;color:#9A9BA7;line-height:1.5;">${link.description}</p>
              </div>`,
                )
                .join("\n              ")}
            </td>
          </tr>`;

  const trackedUnsubscribeHref = wrap(unsubscribeUrl, "unsubscribe");
  const trackingPixel = track
    ? `<img src="${trackingBaseUrl}/api/track/open/${recordId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`
    : "";

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
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#292B32;">Your average response time in ${period} was <strong>${niceTime}</strong>. That's genuinely exceptional.</p>
              <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#292B32;">We made you something to share.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 24px 40px;">
              <img src="${tileImageSrc}" alt="Response Time Champion tile for ${firstName}" width="480" style="display:block;max-width:100%;height:auto;border-radius:12px;" />
            </td>
          </tr>
          ${downloadLinksHtml}
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
        <p style="margin:8px 0 0 0;font-size:12px;color:#9A9BA7;">Don't want to receive these? <a href="${trackedUnsubscribeHref}" style="color:#9A9BA7;text-decoration:underline;">Unsubscribe</a></p>
      </td>
    </tr>
  </table>
  ${trackingPixel}
</body>
</html>`;
}

export function buildEmailText(input: {
  firstName: string;
  agencyName: string;
  responseTimeMins: number;
  period: string;
  downloadLinks: DownloadLink[];
  unsubscribeUrl: string;
}): string {
  const {
    firstName,
    agencyName,
    responseTimeMins,
    period,
    downloadLinks,
    unsubscribeUrl,
  } = input;
  const niceTime = naturalTime(responseTimeMins);
  const linksBlock =
    downloadLinks.length === 0
      ? ""
      : `\nOther versions:\n${downloadLinks
          .map((l) => `- ${l.label} (${l.description}): ${l.url}`)
          .join("\n")}\n`;
  return `Hi ${firstName},

Your average response time in ${period} was ${niceTime}. That's genuinely exceptional.

We made you something to share — your Response Time Champions tile is attached.
${linksBlock}
A few caption ideas if they help:

Professional:
At ${agencyName}, we believe fast communication is the foundation of great property management. Powered by @Ailo, our average response time is ${niceTime}. Your property is in good hands. #propertymanagement #ailo

Conversational:
Ever wonder how fast your property manager responds to your messages? Mine is ${niceTime} on average. Proud to be powered by @Ailo.

Short:
${niceTime} average response time. Not hours. Not days. Minutes. #poweredbyailo

No pressure to post — you've earned the recognition either way.

Thanks for everything you do,
The Ailo Team

---
Don't want to receive these? Unsubscribe: ${unsubscribeUrl}
`;
}
