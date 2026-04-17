export type TileData = {
  agencyName: string;
  firstName: string;
  lastName: string;
  responseTime: string;
  period: string;
  headshotBase64?: string; // data URI or null
  scribbleBase64: string; // data URI
  logoBase64?: string; // data URI — omitted when agency has no logo
  variant: "square" | "ig";
  showName: boolean;
};

export function generateTileHTML(data: TileData): string {
  const isSq = data.variant === "square";
  const w = isSq ? 540 : 540;
  const h = isSq ? 540 : 675;
  const hasPhoto = !!data.headshotBase64;

  const labelText = data.showName
    ? `${data.firstName} ${data.lastName}'s average response time`
    : "My average response time";

  const photoSize = isSq ? 120 : 140;
  const photoOverlap = isSq ? 36 : 42;
  const cardMarginX = isSq ? 68 : 76;
  const headlinePadTop = isSq ? 48 : 72;
  const headlineFontSize = isSq ? 26 : 28;
  const photoMarginTop = isSq ? 20 : 32;
  const cardPadTop = isSq ? 48 : 50;
  const cardPadBottom = isSq ? 24 : 28;
  const numberSize = isSq ? 36 : 42;
  const unitSize = 24;
  const footerBottom = isSq ? 28 : 36;
  const footerPadX = isSq ? 36 : 48;
  const dateSize = isSq ? 14 : 16;
  const poweredBySize = isSq ? 16 : 18;
  const logoHeight = isSq ? 28 : 34;
  const scribbleWidth = isSq ? 140 : 160;

  // Without the photo circle the card sits closer to the headline
  const noPhotoCardMarginTop = isSq ? 28 : 36;
  const noPhotoCardPadTop = isSq ? 28 : 32;

  // Confetti pieces - exact v12 positions
  const confettiSq = [
    // Left cluster
    `<div style="position:absolute;width:9px;height:9px;background:#EE0B4F;transform:rotate(45deg);top:240px;left:42px;border-radius:1px;"></div>`,
    `<div style="position:absolute;width:6px;height:15px;background:#4ECDC4;transform:rotate(-20deg);top:258px;left:18px;border-radius:3px;"></div>`,
    `<div style="position:absolute;width:11px;height:4px;background:#FFD93D;transform:rotate(30deg);top:278px;left:44px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:8px;height:8px;background:#6C5CE7;transform:rotate(60deg);top:248px;left:58px;border-radius:50%;"></div>`,
    `<div style="position:absolute;width:5px;height:13px;background:#EE0B4F;transform:rotate(-40deg);top:286px;left:24px;border-radius:3px;"></div>`,
    `<div style="position:absolute;width:9px;height:4px;background:#00B894;transform:rotate(15deg);top:298px;left:48px;border-radius:1px;"></div>`,
    `<div style="position:absolute;width:7px;height:7px;background:#FDCB6E;transform:rotate(75deg);top:308px;left:14px;border-radius:1px;"></div>`,
    `<div style="position:absolute;width:5px;height:11px;background:#74B9FF;transform:rotate(-55deg);top:264px;left:62px;border-radius:3px;"></div>`,
    // Right cluster
    `<div style="position:absolute;width:10px;height:4px;background:#EE0B4F;transform:rotate(-25deg);top:313px;left:486px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:8px;height:8px;background:#00B894;transform:rotate(45deg);top:330px;left:510px;"></div>`,
    `<div style="position:absolute;width:6px;height:14px;background:#FFD93D;transform:rotate(22deg);top:345px;left:476px;border-radius:3px;"></div>`,
    `<div style="position:absolute;width:11px;height:5px;background:#6C5CE7;transform:rotate(-40deg);top:323px;left:520px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:9px;height:9px;background:#EE0B4F;transform:rotate(30deg);top:363px;left:498px;border-radius:50%;"></div>`,
    `<div style="position:absolute;width:5px;height:13px;background:#74B9FF;transform:rotate(-18deg);top:377px;left:518px;border-radius:3px;"></div>`,
    `<div style="position:absolute;width:10px;height:4px;background:#FDCB6E;transform:rotate(55deg);top:393px;left:480px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:8px;height:8px;background:#4ECDC4;transform:rotate(-55deg);top:403px;left:508px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:7px;height:7px;background:#EE0B4F;transform:rotate(15deg);top:305px;left:502px;border-radius:50%;"></div>`,
    `<div style="position:absolute;width:9px;height:4px;background:#00B894;transform:rotate(-20deg);top:415px;left:490px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:7px;height:7px;background:#FFD93D;transform:rotate(75deg);top:337px;left:464px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:5px;height:12px;background:#6C5CE7;transform:rotate(35deg);top:410px;left:520px;border-radius:3px;"></div>`,
  ];

  const confettiIg = [
    // Left cluster
    `<div style="position:absolute;width:9px;height:9px;background:#EE0B4F;transform:rotate(45deg);top:310px;left:46px;border-radius:1px;"></div>`,
    `<div style="position:absolute;width:6px;height:15px;background:#4ECDC4;transform:rotate(-20deg);top:330px;left:20px;border-radius:3px;"></div>`,
    `<div style="position:absolute;width:11px;height:4px;background:#FFD93D;transform:rotate(30deg);top:352px;left:50px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:8px;height:8px;background:#6C5CE7;transform:rotate(60deg);top:320px;left:64px;border-radius:50%;"></div>`,
    `<div style="position:absolute;width:5px;height:13px;background:#EE0B4F;transform:rotate(-40deg);top:360px;left:28px;border-radius:3px;"></div>`,
    `<div style="position:absolute;width:9px;height:4px;background:#00B894;transform:rotate(15deg);top:374px;left:54px;border-radius:1px;"></div>`,
    `<div style="position:absolute;width:7px;height:7px;background:#FDCB6E;transform:rotate(75deg);top:386px;left:16px;border-radius:1px;"></div>`,
    `<div style="position:absolute;width:5px;height:11px;background:#74B9FF;transform:rotate(-55deg);top:338px;left:68px;border-radius:3px;"></div>`,
    // Right cluster
    `<div style="position:absolute;width:10px;height:4px;background:#EE0B4F;transform:rotate(-25deg);top:395px;left:478px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:8px;height:8px;background:#00B894;transform:rotate(45deg);top:413px;left:506px;"></div>`,
    `<div style="position:absolute;width:6px;height:14px;background:#FFD93D;transform:rotate(22deg);top:431px;left:470px;border-radius:3px;"></div>`,
    `<div style="position:absolute;width:11px;height:5px;background:#6C5CE7;transform:rotate(-40deg);top:405px;left:516px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:9px;height:9px;background:#EE0B4F;transform:rotate(30deg);top:447px;left:492px;border-radius:50%;"></div>`,
    `<div style="position:absolute;width:5px;height:13px;background:#74B9FF;transform:rotate(-18deg);top:463px;left:514px;border-radius:3px;"></div>`,
    `<div style="position:absolute;width:10px;height:4px;background:#FDCB6E;transform:rotate(55deg);top:479px;left:474px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:8px;height:8px;background:#4ECDC4;transform:rotate(-55deg);top:491px;left:504px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:7px;height:7px;background:#EE0B4F;transform:rotate(15deg);top:387px;left:498px;border-radius:50%;"></div>`,
    `<div style="position:absolute;width:9px;height:4px;background:#00B894;transform:rotate(-20deg);top:503px;left:484px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:7px;height:7px;background:#FFD93D;transform:rotate(75deg);top:421px;left:458px;border-radius:2px;"></div>`,
    `<div style="position:absolute;width:5px;height:12px;background:#6C5CE7;transform:rotate(35deg);top:497px;left:516px;border-radius:3px;"></div>`,
  ];

  const confetti = isSq ? confettiSq : confettiIg;

  const rtDecimal = parseFloat(data.responseTime);
  const numberStyle = `font-size:${numberSize}px;font-weight:700;color:#292B32;line-height:1;letter-spacing:-1px;`;
  const unitStyle = `font-size:${unitSize}px;font-weight:600;color:#292B32;letter-spacing:-0.5px;`;

  let metricInner: string;
  if (!Number.isFinite(rtDecimal) || rtDecimal < 1) {
    metricInner = `<span style="${unitStyle}font-weight:700;">Less than a minute</span>`;
  } else {
    let mins = Math.floor(rtDecimal);
    let secs = Math.round((rtDecimal % 1) * 60);
    if (secs === 60) {
      mins += 1;
      secs = 0;
    }
    const minsLabel = mins === 1 ? "Minute" : "Minutes";
    const secsLabel = secs === 1 ? "Second" : "Seconds";
    const minsPart = `<span style="${numberStyle}">${mins}</span><span style="${unitStyle}">${minsLabel}</span>`;
    const secsPart =
      secs === 0
        ? ""
        : `<span style="${numberStyle}">${secs}</span><span style="${unitStyle}">${secsLabel}</span>`;
    metricInner = `${minsPart}${secsPart}`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; }
</style>
</head>
<body>
<div style="position:relative;width:${w}px;height:${h}px;background:#292B32;overflow:hidden;">
  <!-- Headline -->
  <div style="text-align:center;color:#FFFFFF;font-weight:700;letter-spacing:-0.3px;padding:${headlinePadTop}px 40px 0;font-size:${headlineFontSize}px;line-height:1.25;">
    At ${data.agencyName}<br>we take communication seriously.
  </div>

  ${hasPhoto ? `<!-- Photo -->
  <div style="position:relative;z-index:2;display:flex;justify-content:center;margin-top:${photoMarginTop}px;">
    <div style="width:${photoSize}px;height:${photoSize}px;border-radius:50%;overflow:hidden;border:4px solid rgba(255,255,255,0.15);background:#9A9BA7;display:flex;align-items:center;justify-content:center;position:relative;z-index:2;">
      <img src="${data.headshotBase64}" style="width:100%;height:100%;object-fit:cover;" />
    </div>
  </div>` : ""}

  <!-- White Card -->
  <div style="background:#FFFFFF;border-radius:20px;text-align:center;position:relative;z-index:1;margin:${hasPhoto ? `-${photoOverlap}px` : `${noPhotoCardMarginTop}px`} ${cardMarginX}px 0;padding:${hasPhoto ? cardPadTop : noPhotoCardPadTop}px 20px ${cardPadBottom}px;">
    ${data.showName ? `<div style="font-size:14px;color:#9A9BA7;font-weight:500;margin-bottom:12px;">${labelText}</div>` : `<div style="font-size:16px;color:#9A9BA7;font-weight:400;margin-bottom:12px;">${labelText}</div>`}
    <div style="display:flex;align-items:baseline;justify-content:center;gap:10px;white-space:nowrap;">
      ${metricInner}
    </div>
    <div style="display:flex;justify-content:center;margin-top:-2px;">
      <img src="${data.scribbleBase64}" style="width:${scribbleWidth}px;height:auto;" />
    </div>
  </div>

  <!-- Footer -->
  <div style="display:flex;justify-content:space-between;align-items:center;position:absolute;left:0;right:0;bottom:${footerBottom}px;padding:0 ${footerPadX}px;z-index:4;">
    <span style="font-size:${dateSize}px;font-weight:500;color:rgba(255,255,255,0.6);">${data.period}</span>
    <div style="display:flex;align-items:center;gap:8px;font-size:${poweredBySize}px;font-weight:500;color:#FFFFFF;">
      Powered by
      ${data.logoBase64 ? `<img src="${data.logoBase64}" style="height:${logoHeight}px;width:auto;" />` : `<span style="font-weight:700;">Ailo</span>`}
    </div>
  </div>

  <!-- Confetti -->
  <div style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:3;pointer-events:none;">
    ${confetti.join("\n    ")}
  </div>
</div>
</body>
</html>`;
}
