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
  ExternalLink,
  Target,
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

const ACTION_HELP = {
  discover:
    "Searches Google for each agency's website using AI to pick the best match",
  scrape:
    "Visits discovered websites and finds the team/people page for each agency",
  extract:
    "Scrapes team pages, extracts headshot photos, and matches them to PMs by name",
} as const;

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

type Diagnostics = {
  totals: {
    extracted: number;
    matched: number;
    matchRate: number;
    sitesExtracted: number;
  };
  confidence: { exact: number; fuzzy: number; uncertain: number };
  misses: Array<{
    id: string;
    scrapedName: string;
    pmCandidates: Array<{ firstName: string; lastName: string }>;
    agencyName: string;
    agencyDisplayName: string | null;
    teamPageUrl: string | null;
  }>;
};

type EditField = "websiteUrl" | "teamPageUrl";

type EditState = {
  agencyId: string;
  field: EditField;
};

export default function HeadshotFinderPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
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
    const [agencyRes, diagRes] = await Promise.all([
      fetch("/api/headshot-finder/agencies"),
      fetch("/api/headshot-finder/diagnostics"),
    ]);
    const agencyData = await agencyRes.json();
    setAgencies(agencyData.agencies ?? []);
    setTotals(agencyData.totals ?? null);
    if (diagRes.ok) {
      setDiagnostics((await diagRes.json()) as Diagnostics);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const startEditing = (agencyId: string, field: EditField, value: string) => {
    setEditing({ agencyId, field });
    setEditingValue(value);
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditing(null);
    setEditingValue("");
    setEditError(null);
  };

  async function saveEdit(agencyId: string, field: EditField, value: string) {
    const key = `${agencyId}:${field}`;
    setSavingKey(key);
    setEditError(null);
    try {
      const body: Record<string, string> = {};
      body[field] = value;
      const res = await fetch(`/api/headshot-finder/agencies/${agencyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.error ?? "Failed to save");
        return;
      }
      setEditing(null);
      setEditingValue("");
      await fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSavingKey(null);
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
        <div className="flex flex-wrap gap-6">
          <div className="flex max-w-xs flex-col gap-2">
            <Button
              onClick={() => runAction("discover")}
              disabled={!!running}
              title={ACTION_HELP.discover}
              className="w-fit bg-[#EE0B4F] hover:bg-[#d40945]"
            >
              {running === "discover" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Run discovery
            </Button>
            <p className="text-[13px] text-[#9A9BA7]">{ACTION_HELP.discover}</p>
          </div>
          <div className="flex max-w-xs flex-col gap-2">
            <Button
              onClick={() => runAction("scrape")}
              disabled={!!running}
              title={ACTION_HELP.scrape}
              variant="outline"
              className="w-fit"
            >
              {running === "scrape" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Run scrape
            </Button>
            <p className="text-[13px] text-[#9A9BA7]">{ACTION_HELP.scrape}</p>
          </div>
          <div className="flex max-w-xs flex-col gap-2">
            <Button
              onClick={() => runAction("extract")}
              disabled={!!running}
              title={ACTION_HELP.extract}
              variant="outline"
              className="w-fit"
            >
              {running === "extract" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              Run extraction
            </Button>
            <p className="text-[13px] text-[#9A9BA7]">{ACTION_HELP.extract}</p>
          </div>
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

      {diagnostics && <DiagnosticsSection diagnostics={diagnostics} />}

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
                    <EditableUrlCell
                      isEditing={
                        editing?.agencyId === a.id &&
                        editing.field === "websiteUrl"
                      }
                      isSaving={savingKey === `${a.id}:websiteUrl`}
                      value={editingValue}
                      onValueChange={setEditingValue}
                      onStart={() =>
                        startEditing(a.id, "websiteUrl", a.websiteUrl ?? "")
                      }
                      onCancel={cancelEditing}
                      onSave={() => saveEdit(a.id, "websiteUrl", editingValue)}
                      currentUrl={a.websiteUrl}
                      addLabel="— add website —"
                      error={
                        editing?.agencyId === a.id &&
                        editing.field === "websiteUrl"
                          ? editError
                          : null
                      }
                    />
                  </td>
                  <td className="px-5 py-3">
                    <EditableUrlCell
                      isEditing={
                        editing?.agencyId === a.id &&
                        editing.field === "teamPageUrl"
                      }
                      isSaving={savingKey === `${a.id}:teamPageUrl`}
                      value={editingValue}
                      onValueChange={setEditingValue}
                      onStart={() =>
                        startEditing(a.id, "teamPageUrl", a.teamPageUrl ?? "")
                      }
                      onCancel={cancelEditing}
                      onSave={() =>
                        saveEdit(a.id, "teamPageUrl", editingValue)
                      }
                      currentUrl={a.teamPageUrl}
                      addLabel={
                        a.websiteUrl ? "— add team page —" : "— website first —"
                      }
                      disabled={!a.websiteUrl}
                      compact
                      error={
                        editing?.agencyId === a.id &&
                        editing.field === "teamPageUrl"
                          ? editError
                          : null
                      }
                    />
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

function EditableUrlCell({
  isEditing,
  isSaving,
  value,
  onValueChange,
  onStart,
  onCancel,
  onSave,
  currentUrl,
  addLabel,
  disabled,
  compact,
  error,
}: {
  isEditing: boolean;
  isSaving: boolean;
  value: string;
  onValueChange: (v: string) => void;
  onStart: () => void;
  onCancel: () => void;
  onSave: () => void;
  currentUrl: string | null;
  addLabel: string;
  disabled?: boolean;
  compact?: boolean;
  error?: string | null;
}) {
  if (isEditing) {
    return (
      <div className="flex flex-col gap-1">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onBlur={onSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
          disabled={isSaving}
          placeholder="https://example.com"
          className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-[#EE0B4F]"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  const textClass = compact ? "text-xs" : "text-sm";

  if (!currentUrl) {
    return (
      <button
        onClick={onStart}
        disabled={disabled}
        className={`text-left ${textClass} ${
          disabled
            ? "cursor-not-allowed text-gray-300"
            : "text-[#9A9BA7] hover:text-[#292B32]"
        }`}
      >
        {addLabel}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onStart}
        title="Click to edit"
        className={`max-w-[220px] truncate text-left ${textClass} text-[#EE0B4F] hover:underline`}
      >
        {currentUrl.replace(/^https?:\/\//, "")}
      </button>
      <a
        href={currentUrl}
        target="_blank"
        rel="noreferrer"
        title="Open in new tab"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 text-[#9A9BA7] hover:text-[#292B32]"
      >
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}

function DiagnosticsSection({ diagnostics }: { diagnostics: Diagnostics }) {
  const { totals, confidence, misses } = diagnostics;
  const ratePct = (totals.matchRate * 100).toFixed(1);

  return (
    <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-[#EE0B4F]" />
          <h2 className="text-sm font-semibold text-[#292B32]">
            Matching diagnostics
          </h2>
        </div>
        <p className="text-xs text-[#9A9BA7]">
          Across {totals.sitesExtracted} extracted team page
          {totals.sitesExtracted === 1 ? "" : "s"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="People extracted" value={totals.extracted} />
        <Stat label="Total matched" value={totals.matched} />
        <Stat label="Match rate" value={`${ratePct}%`} />
        <Stat
          label="By confidence"
          value={`${confidence.exact} / ${confidence.fuzzy} / ${confidence.uncertain}`}
          sublabel="exact / fuzzy / uncertain"
        />
      </div>
      {misses.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-[#9A9BA7]">
            Recent unmatched extractions
          </p>
          <div className="max-h-80 overflow-y-auto rounded-md border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/80 text-[#9A9BA7]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Agency</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Scraped name
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    PM candidates in gk_pms
                  </th>
                </tr>
              </thead>
              <tbody>
                {misses.map((miss) => (
                  <tr key={miss.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 align-top text-[#292B32]">
                      {miss.agencyDisplayName || miss.agencyName}
                    </td>
                    <td className="px-3 py-2 align-top text-[#292B32]">
                      {miss.scrapedName}
                    </td>
                    <td className="px-3 py-2 align-top text-[#9A9BA7]">
                      {miss.pmCandidates.length === 0
                        ? "(no PMs in this agency)"
                        : miss.pmCandidates
                            .slice(0, 6)
                            .map((c) => `${c.firstName} ${c.lastName}`)
                            .join(", ") +
                          (miss.pmCandidates.length > 6
                            ? ` +${miss.pmCandidates.length - 6} more`
                            : "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg bg-[#F7F7F7] p-3">
      <p className="text-xs text-[#9A9BA7]">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#292B32]">{value}</p>
      {sublabel && <p className="text-[11px] text-[#9A9BA7]">{sublabel}</p>}
    </div>
  );
}
