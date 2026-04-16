"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Download,
  Loader2,
  Check,
  AlertTriangle,
  XCircle,
  Play,
  ArrowLeft,
  Mail,
} from "lucide-react";

type Run = {
  id: string;
  period: string;
  status: string;
  totalPms: number;
  tilesGenerated: number;
  missingAssets: number;
  createdBy: string;
  createdAt: string;
};

type Record = {
  id: string;
  pmId: string;
  agencyName: string;
  responseTimeMins: string;
  tileUrlSquare: string | null;
  tileUrlSquareNamed: string | null;
  tileUrlIg: string | null;
  tileUrlIgNamed: string | null;
  status: string;
  pmFirstName: string;
  pmLastName: string;
  pmEmail: string | null;
};

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function fetchRun() {
    const res = await fetch(`/api/tile-engine/runs/${id}`);
    if (res.ok) {
      const data = await res.json();
      setRun(data.run);
      setRecords(data.records);
    }
  }

  useEffect(() => {
    fetchRun();
  }, [id]);

  async function handleGenerate() {
    setGenerating(true);
    const res = await fetch("/api/tile-engine/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: id }),
    });
    if (res.ok) {
      await fetchRun();
    }
    setGenerating(false);
  }

  async function handleDownloadAll() {
    setDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const rec of records) {
        if (rec.status !== "generated") continue;
        const slug = `${rec.pmFirstName}-${rec.pmLastName}`.toLowerCase();
        const folder = zip.folder(slug)!;

        const urls = [
          { url: rec.tileUrlSquare, name: `${slug}-sq.png` },
          { url: rec.tileUrlSquareNamed, name: `${slug}-sq-named.png` },
          { url: rec.tileUrlIg, name: `${slug}-ig.png` },
          { url: rec.tileUrlIgNamed, name: `${slug}-ig-named.png` },
        ];

        for (const { url, name } of urls) {
          if (!url) continue;
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            folder.file(name, blob);
          } catch {
            // Skip failed downloads
          }
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `tiles-${run?.period?.replace(/\s/g, "-").toLowerCase()}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadPm(rec: Record) {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const slug = `${rec.pmFirstName}-${rec.pmLastName}`.toLowerCase();

    const urls = [
      { url: rec.tileUrlSquare, name: `${slug}-sq.png` },
      { url: rec.tileUrlSquareNamed, name: `${slug}-sq-named.png` },
      { url: rec.tileUrlIg, name: `${slug}-ig.png` },
      { url: rec.tileUrlIgNamed, name: `${slug}-ig-named.png` },
    ];

    for (const { url, name } of urls) {
      if (!url) continue;
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        zip.file(name, blob);
      } catch {
        // Skip failed downloads
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-tiles.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-[#9A9BA7]" />
      </div>
    );
  }

  const generatedRecords = records.filter((r) => r.status === "generated");
  const pendingRecords = records.filter(
    (r) => r.status === "pending" || r.status === "missing_assets"
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button
        onClick={() => router.push("/tile-engine")}
        className="flex items-center gap-1 text-sm text-[#9A9BA7] hover:text-[#292B32]"
      >
        <ArrowLeft className="size-4" />
        Back to Tile Engine
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1E26]">
            Run: {run.period}
          </h1>
          <p className="mt-1 text-sm text-[#9A9BA7]">
            Created by {run.createdBy} on{" "}
            {new Date(run.createdAt).toLocaleDateString("en-AU")}
          </p>
        </div>
        <div className="flex gap-2">
          {pendingRecords.length > 0 && (
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-[#EE0B4F] hover:bg-[#d40945]"
            >
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Generate tiles ({pendingRecords.length})
                </>
              )}
            </Button>
          )}
          {generatedRecords.length > 0 && (
            <Button
              variant="outline"
              onClick={handleDownloadAll}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download all
            </Button>
          )}
          {generatedRecords.length > 0 && (
            <Button
              onClick={() => router.push(`/tile-engine/runs/${id}/deliver`)}
              className="bg-[#EE0B4F] hover:bg-[#d40945]"
            >
              <Mail className="size-4" />
              Deliver
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[#292B32]">{run.totalPms}</p>
          <p className="text-xs text-[#9A9BA7]">Total PMs</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-green-600">
            {run.tilesGenerated}
          </p>
          <p className="text-xs text-[#9A9BA7]">Tiles generated</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {pendingRecords.length}
          </p>
          <p className="text-xs text-[#9A9BA7]">Pending</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">
            {run.missingAssets}
          </p>
          <p className="text-xs text-[#9A9BA7]">Missing assets</p>
        </div>
      </div>

      {/* Records table */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#9A9BA7]">
                PM
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#9A9BA7]">
                Agency
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#9A9BA7]">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#9A9BA7]">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#9A9BA7]">
                Preview
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#9A9BA7]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <tr
                key={rec.id}
                className="border-b border-gray-50 last:border-0"
              >
                <td className="px-4 py-3 font-medium text-[#292B32]">
                  {rec.pmFirstName} {rec.pmLastName}
                </td>
                <td className="px-4 py-3 text-[#9A9BA7]">{rec.agencyName}</td>
                <td className="px-4 py-3 text-[#292B32]">
                  {rec.responseTimeMins}m
                </td>
                <td className="px-4 py-3">
                  {rec.status === "generated" && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <Check className="size-3" /> Generated
                    </span>
                  )}
                  {rec.status === "pending" && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                      Pending
                    </span>
                  )}
                  {rec.status === "missing_assets" && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="size-3" /> Missing assets
                    </span>
                  )}
                  {rec.status === "error" && (
                    <span className="inline-flex items-center gap-1 text-xs text-red-600">
                      <XCircle className="size-3" /> Error
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {rec.tileUrlSquare && (
                    <img
                      src={rec.tileUrlSquare}
                      alt="Tile preview"
                      className="h-16 w-16 rounded border border-gray-100 object-cover"
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  {rec.status === "generated" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadPm(rec)}
                    >
                      <Download className="size-3" />
                      ZIP
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
