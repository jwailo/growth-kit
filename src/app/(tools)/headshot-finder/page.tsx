"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Globe,
  Users,
  ImageIcon,
  Search,
  Download,
  ListChecks,
  Loader2,
  Building2,
} from "lucide-react";

type Agency = {
  id: string;
  name: string;
  displayName: string | null;
  pmCount: number;
  websiteId: string | null;
  websiteUrl: string | null;
  teamPageUrl: string | null;
  scrapeStatus: string | null;
  lastScrapedAt: string | null;
};

type Totals = {
  totalAgencies: number;
  withWebsites: number;
  withTeamPages: number;
  pendingReview: number;
  applied: number;
  rejected: number;
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-gray-100 text-gray-600",
  },
  found: {
    label: "Found",
    className: "bg-blue-50 text-blue-700",
  },
  scraped: {
    label: "Scraped",
    className: "bg-green-50 text-green-700",
  },
  no_team_page: {
    label: "No team page",
    className: "bg-amber-50 text-amber-700",
  },
  error: {
    label: "Error",
    className: "bg-red-50 text-red-700",
  },
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        No website
      </span>
    );
  }
  const info = STATUS_LABELS[status] ?? STATUS_LABELS.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${info.className}`}
    >
      {info.label}
    </span>
  );
}

export default function HeadshotFinderPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [running, setRunning] = useState<
    null | "discover" | "scrape" | "extract"
  >(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    agency: string | null;
    found: number;
    missed: number;
    errors: number;
  } | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/headshot-finder/agencies");
    const data = await res.json();
    setAgencies(data.agencies ?? []);
    setTotals(data.totals ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function saveWebsite(agencyId: string, value: string) {
    setSavingId(agencyId);
    try {
      await fetch(`/api/headshot-finder/agencies/${agencyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: value }),
      });
      await fetchData();
    } finally {
      setSavingId(null);
      setEditingId(null);
      setEditingValue("");
    }
  }

  async function runAction(action: "discover" | "scrape" | "extract") {
    setRunning(action);
    setRunMessage(null);
    setProgress(null);
    try {
      const res = await fetch(`/api/headshot-finder/${action}`, {
        method: "POST",
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (res.ok && contentType.includes("application/x-ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalSummary: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(trimmed);
            } catch {
              continue;
            }
            if (event.type === "start") {
              setProgress({
                current: 0,
                total: Number(event.total) || 0,
                agency: null,
                found: 0,
                missed: 0,
                errors: 0,
              });
            } else if (event.type === "progress") {
              setProgress((prev) => ({
                current: Number(event.current) || 0,
                total: Number(event.total) || prev?.total || 0,
                agency: typeof event.agency === "string" ? event.agency : null,
                found: prev?.found ?? 0,
                missed: prev?.missed ?? 0,
                errors: prev?.errors ?? 0,
              }));
            } else if (event.type === "result") {
              setProgress((prev) => ({
                current: Number(event.current) || prev?.current || 0,
                total: Number(event.total) || prev?.total || 0,
                agency: prev?.agency ?? null,
                found: Number(event.found) || 0,
                missed: Number(event.missed) || 0,
                errors: Number(event.errorCount) || 0,
              }));
            } else if (event.type === "done") {
              finalSummary =
                typeof event.summary === "string" ? event.summary : null;
            }
          }
        }
        setRunMessage(finalSummary ?? "Run complete");
      } else {
        const data = await res.json();
        if (!res.ok) {
          setRunMessage(data.error ?? "Run failed");
        } else {
          setRunMessage(data.summary ?? "Run complete");
        }
      }
      await fetchData();
    } catch (err) {
      setRunMessage(err instanceof Error ? err.message : "Network error");
    } finally {
      setRunning(null);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#1C1E26]">Headshot Finder</h1>
        <p className="mt-1 text-sm text-[#9A9BA7]">
          Discover agency websites, scrape team pages, and match headshots to
          property managers.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          icon={<Building2 className="size-4" />}
          label="Total agencies"
          value={totals?.totalAgencies ?? "—"}
        />
        <SummaryCard
          icon={<Globe className="size-4" />}
          label="With websites"
          value={totals?.withWebsites ?? "—"}
        />
        <SummaryCard
          icon={<Users className="size-4" />}
          label="With team pages"
          value={totals?.withTeamPages ?? "—"}
        />
        <SummaryCard
          icon={<ImageIcon className="size-4" />}
          label="Headshots matched"
          value={
            totals ? totals.pendingReview + totals.applied : "—"
          }
          sublabel={
            totals
              ? `${totals.pendingReview} pending • ${totals.applied} applied • ${totals.rejected} rejected`
              : undefined
          }
        />
      </div>

      {totals && totals.pendingReview > 0 && (
        <Link
          href="/headshot-finder/review"
          className="flex items-center justify-between rounded-xl border border-[#EE0B4F]/30 bg-[#FEF7F9] px-5 py-4 transition-colors hover:bg-[#fde3ea]"
        >
          <div className="flex items-center gap-3">
            <ListChecks className="size-5 text-[#EE0B4F]" />
            <div>
              <p className="text-sm font-semibold text-[#292B32]">
                {totals.pendingReview} match
                {totals.pendingReview === 1 ? "" : "es"} awaiting review
              </p>
              <p className="text-xs text-[#9A9BA7]">
                Approve or reject scraped headshots
              </p>
            </div>
          </div>
          <span className="text-sm font-medium text-[#EE0B4F]">
            Review now →
          </span>
        </Link>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[#292B32]">
          Pipeline actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => runAction("discover")}
            disabled={!!running}
            className="bg-[#EE0B4F] hover:bg-[#d40945]"
          >
            {running === "discover" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Run discovery
          </Button>
          <Button
            onClick={() => runAction("scrape")}
            disabled={!!running}
            variant="outline"
          >
            {running === "scrape" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Run scrape
          </Button>
          <Button
            onClick={() => runAction("extract")}
            disabled={!!running}
            variant="outline"
          >
            {running === "extract" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" />
            )}
            Run extraction
          </Button>
        </div>
        {running && progress && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#292B32]">
              <span>
                Processing {progress.current} of {progress.total}
                {progress.agency ? ` — ${progress.agency}` : ""}
              </span>
              <span className="text-[#9A9BA7]">
                {progress.found} found • {progress.missed} missed
                {progress.errors > 0 ? ` • ${progress.errors} errors` : ""}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[#EE0B4F] transition-all"
                style={{
                  width: progress.total
                    ? `${Math.min(100, (progress.current / progress.total) * 100)}%`
                    : "0%",
                }}
              />
            </div>
          </div>
        )}
        {runMessage && !running && (
          <p className="mt-3 text-xs text-[#9A9BA7]">{runMessage}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-[#292B32]">Agencies</h2>
          <p className="text-xs text-[#9A9BA7]">
            {agencies.length} total
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center px-5 py-12 text-sm text-[#9A9BA7]">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading agencies...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-2 text-left text-xs font-medium text-[#9A9BA7]">
                  Agency
                </th>
                <th className="px-5 py-2 text-left text-xs font-medium text-[#9A9BA7]">
                  Website
                </th>
                <th className="px-5 py-2 text-left text-xs font-medium text-[#9A9BA7]">
                  Team page
                </th>
                <th className="px-5 py-2 text-left text-xs font-medium text-[#9A9BA7]">
                  Status
                </th>
                <th className="px-5 py-2 text-right text-xs font-medium text-[#9A9BA7]">
                  PMs
                </th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-gray-50 last:border-b-0"
                >
                  <td className="px-5 py-3 font-medium text-[#292B32]">
                    {a.displayName || a.name}
                  </td>
                  <td className="px-5 py-3 text-[#292B32]">
                    {editingId === a.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => saveWebsite(a.id, editingValue)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            saveWebsite(a.id, editingValue);
                          if (e.key === "Escape") {
                            setEditingId(null);
                            setEditingValue("");
                          }
                        }}
                        disabled={savingId === a.id}
                        placeholder="https://example.com"
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-[#EE0B4F]"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(a.id);
                          setEditingValue(a.websiteUrl ?? "");
                        }}
                        className={`text-left ${
                          a.websiteUrl
                            ? "text-[#EE0B4F] hover:underline"
                            : "text-[#9A9BA7] hover:text-[#292B32]"
                        }`}
                      >
                        {a.websiteUrl || "— add website —"}
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-[#9A9BA7]">
                    {a.teamPageUrl ? (
                      <a
                        href={a.teamPageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-[#EE0B4F] hover:underline"
                      >
                        {a.teamPageUrl.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={a.scrapeStatus} />
                  </td>
                  <td className="px-5 py-3 text-right text-[#9A9BA7]">
                    {a.pmCount}
                  </td>
                </tr>
              ))}
              {agencies.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-[#9A9BA7]"
                  >
                    No agencies yet. Create a tile run to seed agencies.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-[#9A9BA7]">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-[#292B32]">{value}</p>
      {sublabel && (
        <p className="mt-1 text-xs text-[#9A9BA7]">{sublabel}</p>
      )}
    </div>
  );
}
