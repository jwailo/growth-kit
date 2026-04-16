"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Download,
  Loader2,
  Check,
  Copy,
  ArrowLeft,
  Mail,
} from "lucide-react";

type Run = {
  id: string;
  period: string;
  status: string;
  totalPms: number;
  tilesGenerated: number;
};

type TileRecord = {
  id: string;
  pmId: string;
  agencyName: string;
  responseTimeMins: string;
  tileUrlSquare: string | null;
  tileUrlSquareNamed: string | null;
  tileUrlIg: string | null;
  tileUrlIgNamed: string | null;
  status: string;
  sentAt: string | null;
  pmFirstName: string;
  pmLastName: string;
  pmEmail: string | null;
};

function generateEmailCopy(rec: TileRecord, period: string): string {
  const time = rec.responseTimeMins;
  return `Hey ${rec.pmFirstName}, your average response time in ${period} was ${time} minutes. That's genuinely exceptional.

We made you something to share. Attached are your Response Time Champions tiles — feel free to use them on social media, your website, or wherever you'd like.

Here are a few caption ideas if you'd like them:

Professional:
"At ${rec.agencyName}, we believe fast communication is the foundation of great property management. Powered by @Ailo, our average response time is ${time} minutes. Your property is in good hands. #propertymanagement #ailo"

Conversational:
"Ever wonder how fast your property manager responds to your messages? Mine is ${time} minutes on average. Proud to be powered by @Ailo."

Short:
"${time} minute average response time. Not hours. Not days. Minutes. #poweredbyailo"

Feel free to share this wherever you'd like. You've earned it.`;
}

function getSubjectLine(period: string): string {
  return `Your response time in ${period} was incredible`;
}

export default function DeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [records, setRecords] = useState<TileRecord[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  async function toggleSent(recordId: string, currentlySent: boolean) {
    await fetch(`/api/tile-engine/runs/${id}/mark-sent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId, sent: !currentlySent }),
    });
    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId
          ? { ...r, sentAt: currentlySent ? null : new Date().toISOString() }
          : r
      )
    );
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleDownloadPm(rec: TileRecord) {
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
        // Skip
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-tiles.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleDownloadAll() {
    setDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const rec of generatedRecords) {
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
            // Skip
          }
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `all-tiles-${run?.period?.replace(/\s/g, "-").toLowerCase()}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }

  function copyAllEmails() {
    const emails = generatedRecords
      .map((r) => r.pmEmail)
      .filter(Boolean)
      .join(", ");
    navigator.clipboard.writeText(emails);
    setCopiedId("all-emails");
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-[#9A9BA7]" />
      </div>
    );
  }

  const generatedRecords = records.filter((r) => r.status === "generated");
  const sentCount = generatedRecords.filter((r) => r.sentAt).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button
        onClick={() => router.push(`/tile-engine/runs/${id}`)}
        className="flex items-center gap-1 text-sm text-[#9A9BA7] hover:text-[#292B32]"
      >
        <ArrowLeft className="size-4" />
        Back to run details
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1E26]">
            Delivery: {run.period}
          </h1>
          <p className="mt-1 text-sm text-[#9A9BA7]">
            {sentCount} of {generatedRecords.length} sent
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyAllEmails}>
            {copiedId === "all-emails" ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
            Copy all emails
          </Button>
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
            Download all tiles
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <div className="mb-2 flex justify-between text-xs text-[#9A9BA7]">
          <span>Delivery progress</span>
          <span>
            {sentCount}/{generatedRecords.length}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-[#EE0B4F] transition-all"
            style={{
              width: `${generatedRecords.length > 0 ? (sentCount / generatedRecords.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Per-PM delivery cards */}
      <div className="space-y-4">
        {generatedRecords.map((rec) => {
          const emailCopy = generateEmailCopy(rec, run.period);
          const subject = getSubjectLine(run.period);
          const isSent = !!rec.sentAt;

          return (
            <div
              key={rec.id}
              className={`rounded-xl border bg-white p-6 transition-colors ${
                isSent
                  ? "border-green-200 bg-green-50/30"
                  : "border-gray-100"
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {rec.tileUrlSquare && (
                    <img
                      src={rec.tileUrlSquare}
                      alt="Preview"
                      className="size-12 rounded-lg border border-gray-100 object-cover"
                    />
                  )}
                  <div>
                    <p className="font-medium text-[#292B32]">
                      {rec.pmFirstName} {rec.pmLastName}
                    </p>
                    <p className="text-xs text-[#9A9BA7]">
                      {rec.agencyName} — {rec.responseTimeMins}m
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadPm(rec)}
                  >
                    <Download className="size-3" />
                    Tiles
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => toggleSent(rec.id, isSent)}
                    className={
                      isSent
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-[#EE0B4F] hover:bg-[#d40945]"
                    }
                  >
                    {isSent ? (
                      <>
                        <Check className="size-3" /> Sent
                      </>
                    ) : (
                      <>
                        <Mail className="size-3" /> Mark sent
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Subject line */}
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-[#9A9BA7]">
                    Subject
                  </label>
                  <button
                    onClick={() =>
                      copyToClipboard(subject, `subject-${rec.id}`)
                    }
                    className="flex items-center gap-1 text-xs text-[#EE0B4F] hover:underline"
                  >
                    {copiedId === `subject-${rec.id}` ? (
                      <>
                        <Check className="size-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-[#292B32]">
                  {subject}
                </div>
              </div>

              {/* Email body */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-[#9A9BA7]">
                    Email body
                  </label>
                  <button
                    onClick={() => copyToClipboard(emailCopy, `body-${rec.id}`)}
                    className="flex items-center gap-1 text-xs text-[#EE0B4F] hover:underline"
                  >
                    {copiedId === `body-${rec.id}` ? (
                      <>
                        <Check className="size-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={emailCopy}
                  className="w-full resize-none rounded-lg bg-gray-50 px-3 py-2 text-sm text-[#292B32] outline-none"
                  rows={12}
                />
              </div>
            </div>
          );
        })}
      </div>

      {generatedRecords.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-white py-12 text-center">
          <p className="text-[#9A9BA7]">
            No generated tiles yet. Go back to the run and generate tiles first.
          </p>
        </div>
      )}
    </div>
  );
}
