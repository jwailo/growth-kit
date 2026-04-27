"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  Loader2,
  Mail,
  Eye,
  MousePointerClick,
} from "lucide-react";

type PerPm = {
  recordId: string;
  pmFirstName: string;
  pmLastName: string;
  agencyName: string;
  pmEmail: string | null;
  sentAt: string | null;
  opened: boolean;
  openCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  clicked: boolean;
  linksClicked: string[];
  totalClicks: number;
};

type Analytics = {
  totalSent: number;
  opened: number;
  openRate: number;
  clicked: number;
  clickRate: number;
  totalClicks: number;
  clicksByLink: Record<string, number>;
  timeseries: { day: string; opens: number; clicks: number }[];
  perPm: Record<string, PerPm>;
};

type Run = {
  id: string;
  period: string;
  status: string;
};

type SortKey =
  | "name"
  | "agency"
  | "sentAt"
  | "opened"
  | "firstOpenedAt"
  | "lastOpenedAt"
  | "totalClicks";

type SortState = { key: SortKey; dir: "asc" | "desc" };

type Filter = "all" | "opened" | "not_opened" | "clicked" | "not_clicked";

const LINK_LABELS: Record<string, string> = {
  tile_square_named: "Square (named)",
  tile_ig: "Instagram",
  tile_ig_named: "Instagram (named)",
  download_all: "Download all",
  unsubscribe: "Unsubscribe",
};

function formatLinkName(name: string): string {
  return LINK_LABELS[name] ?? name;
}

function formatRate(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatDay(day: string): string {
  try {
    return new Date(`${day}T00:00:00`).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return day;
  }
}

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [runRes, analyticsRes] = await Promise.all([
        fetch(`/api/tile-engine/runs/${id}`),
        fetch(`/api/tile-engine/runs/${id}/analytics`),
      ]);
      if (!cancelled && runRes.ok) {
        const data = await runRes.json();
        setRun(data.run);
      }
      if (!cancelled && analyticsRes.ok) {
        const data = (await analyticsRes.json()) as Analytics;
        setAnalytics(data);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const sortedFilteredRows = useMemo(() => {
    if (!analytics) return [];
    const rows = Object.values(analytics.perPm).filter((r) => {
      if (!r.sentAt) return false;
      switch (filter) {
        case "opened":
          return r.opened;
        case "not_opened":
          return !r.opened;
        case "clicked":
          return r.clicked;
        case "not_clicked":
          return !r.clicked;
        default:
          return true;
      }
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let av: string | number | null = null;
      let bv: string | number | null = null;
      switch (sort.key) {
        case "name":
          av = `${a.pmLastName} ${a.pmFirstName}`.toLowerCase();
          bv = `${b.pmLastName} ${b.pmFirstName}`.toLowerCase();
          break;
        case "agency":
          av = a.agencyName.toLowerCase();
          bv = b.agencyName.toLowerCase();
          break;
        case "sentAt":
          av = a.sentAt ?? "";
          bv = b.sentAt ?? "";
          break;
        case "opened":
          av = a.openCount;
          bv = b.openCount;
          break;
        case "firstOpenedAt":
          av = a.firstOpenedAt ?? "";
          bv = b.firstOpenedAt ?? "";
          break;
        case "lastOpenedAt":
          av = a.lastOpenedAt ?? "";
          bv = b.lastOpenedAt ?? "";
          break;
        case "totalClicks":
          av = a.totalClicks;
          bv = b.totalClicks;
          break;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [analytics, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-[#9A9BA7]" />
      </div>
    );
  }

  if (!run || !analytics) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-[#9A9BA7]">
        Couldn&apos;t load analytics for this run.
      </div>
    );
  }

  const linkChartData = Object.entries(analytics.clicksByLink)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name: formatLinkName(name),
      clicks: count,
    }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button
        onClick={() => router.push(`/tile-engine/runs/${id}`)}
        className="flex items-center gap-1 text-sm text-[#9A9BA7] hover:text-[#292B32]"
      >
        <ArrowLeft className="size-4" />
        Back to run details
      </button>

      <div>
        <h1 className="text-2xl font-bold text-[#1C1E26]">
          Analytics: {run.period}
        </h1>
        <p className="mt-1 text-sm text-[#9A9BA7]">
          Email engagement for this run
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryTile
          icon={<Mail className="size-4" />}
          label="Sent"
          value={analytics.totalSent}
        />
        <SummaryTile
          icon={<Eye className="size-4" />}
          label="Opened"
          value={analytics.opened}
          rate={analytics.openRate}
        />
        <SummaryTile
          icon={<MousePointerClick className="size-4" />}
          label="Clicked"
          value={analytics.clicked}
          rate={analytics.clickRate}
        />
        <SummaryTile
          icon={<MousePointerClick className="size-4" />}
          label="Total clicks"
          value={analytics.totalClicks}
        />
      </div>

      {/* Rate bars */}
      <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-5">
        <RateBar
          label="Open rate"
          value={analytics.openRate}
          countLabel={`${analytics.opened} of ${analytics.totalSent}`}
        />
        <RateBar
          label="Click rate"
          value={analytics.clickRate}
          countLabel={`${analytics.clicked} of ${analytics.totalSent}`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[#292B32]">
            Opens and clicks over time
          </h2>
          {analytics.timeseries.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#9A9BA7]">
              No engagement data yet
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={analytics.timeseries.map((t) => ({
                    ...t,
                    label: formatDay(t.day),
                  }))}
                >
                  <CartesianGrid stroke="#F0F0F0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#9A9BA7" }}
                    tickLine={false}
                    axisLine={{ stroke: "#E0E0E0" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#9A9BA7" }}
                    tickLine={false}
                    axisLine={{ stroke: "#E0E0E0" }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="opens"
                    stroke="#EE0B4F"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Opens"
                  />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    stroke="#292B32"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Clicks"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[#292B32]">
            Clicks by link
          </h2>
          {linkChartData.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#9A9BA7]">
              No clicks yet
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={linkChartData} layout="vertical">
                  <CartesianGrid stroke="#F0F0F0" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#9A9BA7" }}
                    tickLine={false}
                    axisLine={{ stroke: "#E0E0E0" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 11, fill: "#292B32" }}
                    tickLine={false}
                    axisLine={{ stroke: "#E0E0E0" }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="clicks" fill="#EE0B4F" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Per-PM table */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-[#292B32]">
            Per-PM engagement
          </h2>
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5 text-xs">
            {(
              [
                ["all", "All"],
                ["opened", "Opened"],
                ["not_opened", "Not opened"],
                ["clicked", "Clicked"],
                ["not_clicked", "Not clicked"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${
                  filter === key
                    ? "bg-white text-[#292B32] shadow-sm"
                    : "text-[#9A9BA7] hover:text-[#292B32]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <SortHeader
                  label="Name"
                  sortKey="name"
                  sort={sort}
                  onClick={toggleSort}
                />
                <SortHeader
                  label="Agency"
                  sortKey="agency"
                  sort={sort}
                  onClick={toggleSort}
                />
                <SortHeader
                  label="Sent at"
                  sortKey="sentAt"
                  sort={sort}
                  onClick={toggleSort}
                />
                <SortHeader
                  label="Opened"
                  sortKey="opened"
                  sort={sort}
                  onClick={toggleSort}
                  align="right"
                />
                <SortHeader
                  label="First opened"
                  sortKey="firstOpenedAt"
                  sort={sort}
                  onClick={toggleSort}
                />
                <SortHeader
                  label="Last opened"
                  sortKey="lastOpenedAt"
                  sort={sort}
                  onClick={toggleSort}
                />
                <th className="px-4 py-2 text-left text-xs font-medium text-[#9A9BA7]">
                  Links clicked
                </th>
                <SortHeader
                  label="Clicks"
                  sortKey="totalClicks"
                  sort={sort}
                  onClick={toggleSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {sortedFilteredRows.map((r) => (
                <tr
                  key={r.recordId}
                  className="border-b border-gray-50 last:border-b-0"
                >
                  <td className="px-4 py-2 text-[#292B32]">
                    <div className="font-medium">
                      {r.pmFirstName} {r.pmLastName}
                    </div>
                    {r.pmEmail && (
                      <div className="text-xs text-[#9A9BA7]">
                        {r.pmEmail}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[#9A9BA7]">
                    {r.agencyName}
                  </td>
                  <td className="px-4 py-2 text-xs text-[#9A9BA7]">
                    {formatTimestamp(r.sentAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.opened ? (
                      <span className="font-medium text-green-700">
                        Yes ({r.openCount})
                      </span>
                    ) : (
                      <span className="text-[#9A9BA7]">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-[#9A9BA7]">
                    {formatTimestamp(r.firstOpenedAt)}
                  </td>
                  <td className="px-4 py-2 text-xs text-[#9A9BA7]">
                    {formatTimestamp(r.lastOpenedAt)}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.linksClicked.length === 0 ? (
                      <span className="text-[#9A9BA7]">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.linksClicked.map((name) => (
                          <span
                            key={name}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[#292B32]"
                          >
                            {formatLinkName(name)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-[#292B32]">
                    {r.totalClicks}
                  </td>
                </tr>
              ))}
              {sortedFilteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm text-[#9A9BA7]"
                  >
                    No PMs match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  rate,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  rate?: number;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-[#9A9BA7]">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-[#1C1E26]">{value}</p>
      {rate !== undefined && (
        <p className="mt-1 text-xs text-[#9A9BA7]">{formatRate(rate)}</p>
      )}
    </div>
  );
}

function RateBar({
  label,
  value,
  countLabel,
}: {
  label: string;
  value: number;
  countLabel: string;
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-[#292B32]">
        <span className="font-medium">{label}</span>
        <span className="text-[#9A9BA7]">
          {formatRate(value)} &middot; {countLabel}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-[#EE0B4F] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onClick,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onClick: (key: SortKey) => void;
  align?: "right";
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`px-4 py-2 text-xs font-medium text-[#9A9BA7] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-[#292B32] ${
          active ? "text-[#292B32]" : ""
        }`}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </th>
  );
}
