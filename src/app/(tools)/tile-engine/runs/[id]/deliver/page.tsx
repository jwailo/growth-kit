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
  Send,
  AlertCircle,
  MailX,
  X,
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

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "failed"; error: string };

function generateEmailCopy(rec: TileRecord, period: string): string {
  const time = rec.responseTimeMins;
  return `Hi ${rec.pmFirstName},

Your average response time in ${period} was ${time} minutes. That's genuinely exceptional.

We made you something to share — your Response Time Champions tile is attached.

A few caption ideas if they help:

Professional:
"At ${rec.agencyName}, we believe fast communication is the foundation of great property management. Powered by @Ailo, our average response time is ${time} minutes. Your property is in good hands. #propertymanagement #ailo"

Conversational:
"Ever wonder how fast your property manager responds to your messages? Mine is ${time} minutes on average. Proud to be powered by @Ailo."

Short:
"${time} minute average response time. Not hours. Not days. Minutes. #poweredbyailo"

No pressure to post — you've earned the recognition either way.

Thanks for everything you do,
The Ailo Team`;
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
  const [sendStates, setSendStates] = useState<Record<string, SendState>>({});
  const [batchSending, setBatchSending] = useState(false);
  const [batchResult, setBatchResult] = useState<{
    sent: number;
    skipped: number;
    failed: number;
    total: number;
  } | null>(null);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function setSendState(recordId: string, state: SendState) {
    setSendStates((prev) => ({ ...prev, [recordId]: state }));
  }

  async function handleSendEmail(rec: TileRecord) {
    if (!rec.pmEmail) return;
    setSendState(rec.id, { kind: "sending" });

    try {
      const res = await fetch(`/api/tile-engine/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: rec.id }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setSendState(rec.id, {
          kind: "failed",
          error: data.error ?? "Send failed",
        });
        return;
      }

      setSendState(rec.id, { kind: "sent" });
      setRecords((prev) =>
        prev.map((r) =>
          r.id === rec.id ? { ...r, sentAt: new Date().toISOString() } : r,
        ),
      );
    } catch (err) {
      setSendState(rec.id, {
        kind: "failed",
        error: err instanceof Error ? err.message : "Network error",
      });
    }
  }

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
          : r,
      ),
    );
  }

  async function handleBatchSend() {
    setShowBatchConfirm(false);
    setBatchSending(true);
    setBatchResult(null);

    const pendingWithEmail = generatedRecords.filter(
      (r) => !r.sentAt && r.pmEmail,
    );
    pendingWithEmail.forEach((r) =>
      setSendState(r.id, { kind: "sending" }),
    );

    try {
      const res = await fetch(`/api/tile-engine/send-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: id }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setBatchResult({
          total: data.total,
          sent: data.sent,
          skipped: data.skipped,
          failed: data.failed,
        });
        const failureIds = new Set<string>(
          (data.failures ?? []).map(
            (f: { recordId: string }) => f.recordId,
          ),
        );
        const failureMap = new Map<string, string>(
          (data.failures ?? []).map(
            (f: { recordId: string; error: string }) =>
              [f.recordId, f.error] as [string, string],
          ),
        );
        setSendStates((prev) => {
          const next = { ...prev };
          for (const r of pendingWithEmail) {
            if (failureIds.has(r.id)) {
              next[r.id] = {
                kind: "failed",
                error: failureMap.get(r.id) ?? "Send failed",
              };
            } else {
              next[r.id] = { kind: "sent" };
            }
          }
          return next;
        });
        await fetchRun();
      } else {
        pendingWithEmail.forEach((r) =>
          setSendState(r.id, {
            kind: "failed",
            error: data.error ?? "Batch send failed",
          }),
        );
      }
    } catch (err) {
      pendingWithEmail.forEach((r) =>
        setSendState(r.id, {
          kind: "failed",
          error: err instanceof Error ? err.message : "Network error",
        }),
      );
    } finally {
      setBatchSending(false);
    }
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
  const pendingWithEmail = generatedRecords.filter(
    (r) => !r.sentAt && r.pmEmail,
  );
  const pendingWithoutEmail = generatedRecords.filter(
    (r) => !r.sentAt && !r.pmEmail,
  );

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
            {pendingWithoutEmail.length > 0 && (
              <>
                {" "}&middot; {pendingWithoutEmail.length} missing email
              </>
            )}
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
          <Button
            onClick={() => setShowBatchConfirm(true)}
            disabled={batchSending || pendingWithEmail.length === 0}
            className="bg-[#EE0B4F] hover:bg-[#d40945]"
          >
            {batchSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send all ({pendingWithEmail.length})
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

      {/* Batch send summary */}
      {batchResult && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50/60 p-4">
          <Check className="mt-0.5 size-5 text-green-600" />
          <div className="flex-1 text-sm text-[#292B32]">
            <p className="font-medium">Batch send complete</p>
            <p className="text-[#9A9BA7]">
              {batchResult.sent} sent &middot; {batchResult.skipped} skipped
              {batchResult.failed > 0 && (
                <> &middot; {batchResult.failed} failed</>
              )}{" "}
              (of {batchResult.total})
            </p>
          </div>
          <button
            onClick={() => setBatchResult(null)}
            className="text-[#9A9BA7] hover:text-[#292B32]"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Per-PM delivery cards */}
      <div className="space-y-4">
        {generatedRecords.map((rec) => {
          const emailCopy = generateEmailCopy(rec, run.period);
          const subject = getSubjectLine(run.period);
          const isSent = !!rec.sentAt;
          const sendState: SendState = sendStates[rec.id] ?? { kind: "idle" };
          const hasEmail = !!rec.pmEmail;
          const sending = sendState.kind === "sending";
          const failed = sendState.kind === "failed";

          return (
            <div
              key={rec.id}
              className={`rounded-xl border bg-white p-6 transition-colors ${
                isSent
                  ? "border-green-200 bg-green-50/30"
                  : failed
                    ? "border-red-200 bg-red-50/30"
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
                      {rec.agencyName} &mdash; {rec.responseTimeMins}m
                      {hasEmail ? (
                        <> &middot; {rec.pmEmail}</>
                      ) : (
                        <>
                          {" "}&middot;{" "}
                          <span className="font-medium text-amber-600">
                            no email on file
                          </span>
                        </>
                      )}
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
                  {!hasEmail ? (
                    <Button
                      size="sm"
                      disabled
                      variant="outline"
                      className="text-amber-600"
                    >
                      <MailX className="size-3" />
                      No email
                    </Button>
                  ) : isSent ? (
                    <Button
                      size="sm"
                      onClick={() => toggleSent(rec.id, true)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="size-3" />
                      Sent
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleSendEmail(rec)}
                      disabled={sending || batchSending}
                      className="bg-[#EE0B4F] hover:bg-[#d40945]"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          Sending
                        </>
                      ) : (
                        <>
                          <Mail className="size-3" />
                          Send email
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {failed && (
                <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">Send failed</p>
                    <p className="text-xs">{sendState.error}</p>
                  </div>
                  <button
                    onClick={() => handleSendEmail(rec)}
                    className="text-xs font-medium text-red-700 underline hover:text-red-900"
                  >
                    Retry
                  </button>
                </div>
              )}

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

      {/* Batch confirm modal */}
      {showBatchConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !batchSending && setShowBatchConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2">
              <Send className="size-5 text-[#EE0B4F]" />
              <h2 className="text-lg font-semibold text-[#1C1E26]">
                Send {pendingWithEmail.length}{" "}
                {pendingWithEmail.length === 1 ? "email" : "emails"}?
              </h2>
            </div>
            <p className="mb-4 text-sm text-[#9A9BA7]">
              This will send the Response Time Champion email to every PM with
              a generated tile and an email address on file. Emails are sent
              one per second to respect Gmail rate limits.
            </p>
            {pendingWithoutEmail.length > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>
                  {pendingWithoutEmail.length}{" "}
                  {pendingWithoutEmail.length === 1 ? "PM" : "PMs"} will be
                  skipped (no email on file).
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowBatchConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBatchSend}
                className="bg-[#EE0B4F] hover:bg-[#d40945]"
              >
                <Send className="size-4" />
                Send {pendingWithEmail.length}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
