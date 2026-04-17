import type { Browser } from "puppeteer-core";
import { generateTileHTML, type TileData } from "./template";

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  // Dynamic string defeats webpack static tracing so puppeteer (a devDep)
  // isn't pulled into the Vercel build bundle.
  const moduleName = "puppeteer";
  const puppeteer = await import(/* webpackIgnore: true */ moduleName);
  return puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  }) as unknown as Browser;
}

export async function renderTile(data: TileData): Promise<Buffer> {
  const html = generateTileHTML(data);
  const displayWidth = 540;
  const displayHeight = data.variant === "square" ? 540 : 675;

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: displayWidth,
      height: displayHeight,
      deviceScaleFactor: 2, // 2x for crisp 1080px output
    });
    await page.setContent(html, { waitUntil: "networkidle0" });

    const screenshot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: displayWidth, height: displayHeight },
    });

    return Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
}

export type TileVariant = {
  key: "square" | "square_named" | "ig" | "ig_named";
  variant: "square" | "ig";
  showName: boolean;
  filenameSuffix: string;
  dbField: "tileUrlSquare" | "tileUrlSquareNamed" | "tileUrlIg" | "tileUrlIgNamed";
};

export const TILE_VARIANTS: TileVariant[] = [
  {
    key: "square",
    variant: "square",
    showName: false,
    filenameSuffix: "sq",
    dbField: "tileUrlSquare",
  },
  {
    key: "square_named",
    variant: "square",
    showName: true,
    filenameSuffix: "sq-named",
    dbField: "tileUrlSquareNamed",
  },
  {
    key: "ig",
    variant: "ig",
    showName: false,
    filenameSuffix: "ig",
    dbField: "tileUrlIg",
  },
  {
    key: "ig_named",
    variant: "ig",
    showName: true,
    filenameSuffix: "ig-named",
    dbField: "tileUrlIgNamed",
  },
];
