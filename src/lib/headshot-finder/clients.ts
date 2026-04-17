import Anthropic from "@anthropic-ai/sdk";
import Firecrawl from "@mendable/firecrawl-js";

let anthropicClient: Anthropic | null = null;
let firecrawlClient: Firecrawl | null = null;

export function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    anthropicClient = new Anthropic({ apiKey: key });
  }
  return anthropicClient;
}

export function getFirecrawl(): Firecrawl {
  if (!firecrawlClient) {
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
    firecrawlClient = new Firecrawl({ apiKey: key });
  }
  return firecrawlClient;
}

export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

export function extractJson<T = unknown>(text: string): T | null {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenceMatch ? fenceMatch[1] : trimmed;
  try {
    return JSON.parse(body) as T;
  } catch {
    const first = body.indexOf("{");
    const firstArr = body.indexOf("[");
    const start =
      first === -1
        ? firstArr
        : firstArr === -1
          ? first
          : Math.min(first, firstArr);
    if (start === -1) return null;
    const opener = body[start];
    const closer = opener === "{" ? "}" : "]";
    const end = body.lastIndexOf(closer);
    if (end === -1 || end < start) return null;
    try {
      return JSON.parse(body.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
