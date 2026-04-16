import puppeteer from "puppeteer";
import { generateTileHTML, type TileData } from "./template";

export async function renderTile(
  data: TileData
): Promise<Buffer> {
  const html = generateTileHTML(data);
  const width = data.variant === "square" ? 1080 : 1080;
  const height = data.variant === "square" ? 1080 : 1350;
  const displayWidth = 540;
  const displayHeight = data.variant === "square" ? 540 : 675;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

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
