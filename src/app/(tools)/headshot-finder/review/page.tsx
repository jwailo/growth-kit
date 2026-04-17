"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Check,
  X,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from "lucide-react";

type Match = {
  id: string;
  pmId: string;
  scrapedName: string;
  scrapedImageUrl: string;
  storedImageUrl: string | null;
  confidence: "exact" | "fuzzy" | "uncertain";
  matchScore: string;
  status: string;
  pmFirstName: string;
  pmLastName: string;
  pmHeadshotUrl: string | null;
  agencyId: string;
  agencyName: string;
  agencyDisplayName: string | null;
  teamPageUrl: string | null;
};

type Filters = {
  exact: boolean;
  fuzzy: boolean;
  uncertain: boolean;
};

const CONFIDENCE_STYLES: Record<
  Match["confidence"],
  { label: string; className: string }
> = {
  exact: {
    label: "Exact",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  fuzzy: {
    label: "Fuzzy",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  uncertain: {
    label: "Uncertain",
    className: "bg-red-50 text-red-700 border-red-200",
  },
};

export default function ReviewPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState<null | "exact" | "all">(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    exact: true,
    fuzzy: true,
    uncertain: true,
  });

  const fetchMatches = useCallback(async () => {
    const res = await fetch("/api/headshot-finder/matches");
    const data: Match[] = await res.json();
    setMatches(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const filteredMatches = useMemo(
    () => matches.filter((m) => filters[m.confidence]),
    [matches, filters],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { agencyName: string; items: Match[] }>();
    for (const m of filteredMatches) {
      const name = m.agencyDisplayName || m.agencyName;
      const existing = map.get(m.agencyId);
      if (existing) {
        existing.items.push(m);
      } else {
        map.set(m.agencyId, { agencyName: name, items: [m] });
      }
    }
    return Array.from(map.entries()).sort(([, a], [, b]) =>
      a.agencyName.localeCompare(b.agencyName),
    );
  }, [filteredMatches]);

  async function actOn(matchId: string, action: "approve" | "reject") {
    setActing(matchId);
    try {
      const res = await fetch(`/api/headshot-finder/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setMatches((prev) => prev.filter((m) => m.id !== matchId));
      }
    } finally {
      setActing(null);
    }
  }

  async function bulkApprove(confidence: "exact" | "all") {
    const exactCount = matches.filter((m) => m.confidence === "exact").length;
    const message =
      confidence === "exact"
        ? `Approve all ${exactCount} exact match${exactCount === 1 ? "" : "es"}? This will replace any existing headshots.`
        : `Approve ALL ${matches.length} pending matches, including fuzzy and uncertain ones? This will replace any existing headshots and cannot be undone.`;
    if (!window.confirm(message)) return;

    setBulkRunning(confidence);
    setBulkMessage(null);
    try {
      const res = await fetch("/api/headshot-finder/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confidence }),
      });
      const data = await res.json();
      setBulkMessage(data.summary ?? (res.ok ? "Bulk approve complete" : data.error));
      await fetchMatches();
    } catch (err) {
      setBulkMessage(err instanceof Error ? err.message : "Network error");
    } finally {
      setBulkRunning(null);
    }
  }

  const exactCount = matches.filter((m) => m.confidence === "exact").length;
  const fuzzyCount = matches.filter((m) => m.confidence === "fuzzy").length;
  const uncertainCount = matches.filter(
    (m) => m.confidence === "uncertain",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/headshot-finder"
            className="mb-2 inline-flex items-center gap-1 text-xs text-[#9A9BA7] hover:text-[#292B32]"
          >
            <ArrowLeft className="size-3" /> Back to Headshot Finder
          </Link>
          <h1 className="text-2xl font-bold text-[#1C1E26]">Review matches</h1>
          <p className="mt-1 text-sm text-[#9A9BA7]">
            {matches.length} match{matches.length === 1 ? "" : "es"} awaiting
            review
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => bulkApprove("exact")}
            disabled={!!bulkRunning || exactCount === 0}
          >
            {bulkRunning === "exact" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Approve all exact ({exactCount})
          </Button>
          <Button
            className="bg-[#EE0B4F] hover:bg-[#d40945]"
            onClick={() => bulkApprove("all")}
            disabled={!!bulkRunning || matches.length === 0}
          >
            {bulkRunning === "all" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Approve all ({matches.length})
          </Button>
        </div>
      </div>

      {bulkMessage && (
        <div className="rounded-lg border border-gray-100 bg-white px-4 py-3 text-sm text-[#292B32]">
          {bulkMessage}
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-100 bg-white p-3">
        <FilterChip
          active={filters.exact}
          onClick={() =>
            setFilters((f) => ({ ...f, exact: !f.exact }))
          }
          label={`Exact (${exactCount})`}
          color="green"
        />
        <FilterChip
          active={filters.fuzzy}
          onClick={() =>
            setFilters((f) => ({ ...f, fuzzy: !f.fuzzy }))
          }
          label={`Fuzzy (${fuzzyCount})`}
          color="amber"
        />
        <FilterChip
          active={filters.uncertain}
          onClick={() =>
            setFilters((f) => ({ ...f, uncertain: !f.uncertain }))
          }
          label={`Uncertain (${uncertainCount})`}
          color="red"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-gray-100 bg-white px-5 py-16 text-sm text-[#9A9BA7]">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading matches...
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white px-5 py-16 text-center text-sm text-[#9A9BA7]">
          No pending matches with the current filters.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([agencyId, group]) => (
            <section
              key={agencyId}
              className="overflow-hidden rounded-xl border border-gray-100 bg-white"
            >
              <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#292B32]">
                    {group.agencyName}
                  </h2>
                  <p className="text-xs text-[#9A9BA7]">
                    {group.items.length} pending match
                    {group.items.length === 1 ? "" : "es"}
                  </p>
                </div>
                {group.items[0]?.teamPageUrl && (
                  <a
                    href={group.items[0].teamPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#EE0B4F] hover:underline"
                  >
                    View team page <ExternalLink className="size-3" />
                  </a>
                )}
              </header>
              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    busy={acting === m.id}
                    onApprove={() => actOn(m.id, "approve")}
                    onReject={() => actOn(m.id, "reject")}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color: "green" | "amber" | "red";
}) {
  const activeClass = {
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
  }[color];
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? activeClass
          : "border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );
}

function MatchCard({
  match,
  busy,
  onApprove,
  onReject,
}: {
  match: Match;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const confidence = CONFIDENCE_STYLES[match.confidence];
  const scorePct = Math.round(parseFloat(match.matchScore) * 100);
  const imageSrc = match.storedImageUrl ?? match.scrapedImageUrl;
  const hasExistingHeadshot = !!match.pmHeadshotUrl;

  return (
    <article className="rounded-lg border border-gray-100 bg-[#F7F7F7] p-4">
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={match.scrapedName}
          className="size-20 flex-shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#292B32]">
            {match.pmFirstName} {match.pmLastName}
          </p>
          <p className="mt-0.5 truncate text-xs text-[#9A9BA7]">
            Scraped as: {match.scrapedName}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${confidence.className}`}
            >
              {confidence.label}
            </span>
            <span className="text-xs text-[#9A9BA7]">{scorePct}% match</span>
          </div>
        </div>
      </div>

      {hasExistingHeadshot && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Approving will replace the existing headshot.</span>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={onApprove}
          disabled={busy}
          className="flex-1 bg-[#EE0B4F] hover:bg-[#d40945]"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onReject}
          disabled={busy}
          className="flex-1"
        >
          <X className="size-3.5" />
          Reject
        </Button>
      </div>
    </article>
  );
}
