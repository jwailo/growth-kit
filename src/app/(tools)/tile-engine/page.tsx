"use client";

import { useState, useCallback } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  Upload,
  ArrowRight,
  Check,
  AlertTriangle,
  XCircle,
  Loader2,
} from "lucide-react";

type Step = "upload" | "map" | "validate" | "review" | "complete";

type ParsedData = {
  headers: string[];
  rows: Record<string, string>[];
};

type ColumnMapping = {
  fullName: string;
  firstName: string;
  lastName: string;
  agencyName: string;
  responseTimeMins: string;
  email: string;
};

type ValidationResult = {
  rowIndex: number;
  row: MappedRow;
  status: "pass" | "warning" | "error";
  issues: string[];
  excluded: boolean;
};

type MappedRow = {
  firstName: string;
  lastName: string;
  agencyName: string;
  responseTimeMins: number;
  email?: string;
};

function getDefaultPeriod(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return prev.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || (parts.length === 1 && !parts[0])) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  return { firstName, lastName };
}

export default function TileEnginePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    fullName: "",
    firstName: "",
    lastName: "",
    agencyName: "",
    responseTimeMins: "",
    email: "",
  });
  const [period, setPeriod] = useState(getDefaultPeriod());
  const [validationResults, setValidationResults] = useState<
    ValidationResult[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    runId: string;
    skipped?: { row: number; name: string; reasons: string[] }[];
    summary: {
      totalPms: number;
      matchedPms: number;
      newPms: number;
      newAgencies: number;
      missingAssets: number;
    };
  } | null>(null);

  function handleFileUpload(file: File) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        setParsed({
          headers,
          rows: results.data as Record<string, string>[],
        });
        // Try auto-mapping common column names
        const autoMap: ColumnMapping = {
          fullName: "",
          firstName: "",
          lastName: "",
          agencyName: "",
          responseTimeMins: "",
          email: "",
        };
        for (const h of headers) {
          const lower = h.toLowerCase().replace(/[_\s]+/g, "");
          if (lower.includes("firstname") || lower === "first")
            autoMap.firstName = h;
          else if (lower.includes("lastname") || lower === "last")
            autoMap.lastName = h;
          else if (
            lower.includes("agency") ||
            lower.includes("company")
          )
            autoMap.agencyName = h;
          else if (
            lower.includes("response") ||
            lower.includes("time") ||
            lower.includes("minutes")
          )
            autoMap.responseTimeMins = h;
          else if (lower.includes("email")) autoMap.email = h;
          else if (
            lower === "name" ||
            lower === "fullname" ||
            lower === "agentname" ||
            lower === "agent" ||
            lower === "pmname" ||
            lower === "pm"
          )
            autoMap.fullName = h;
        }
        // Only use fullName if separate first/last weren't found
        if (autoMap.firstName && autoMap.lastName) {
          autoMap.fullName = "";
        }
        setMapping(autoMap);
        setStep("map");
      },
    });
  }

  function runValidation() {
    if (!parsed) return;

    const useFullName = !!mapping.fullName;

    const results: ValidationResult[] = parsed.rows.map((row, idx) => {
      let firstName: string;
      let lastName: string;

      if (useFullName) {
        const split = splitFullName(row[mapping.fullName] || "");
        firstName = split.firstName;
        lastName = split.lastName;
      } else {
        firstName = (row[mapping.firstName] || "").trim();
        lastName = (row[mapping.lastName] || "").trim();
      }

      const mapped: MappedRow = {
        firstName,
        lastName,
        agencyName: (row[mapping.agencyName] || "").trim(),
        responseTimeMins: parseFloat(row[mapping.responseTimeMins] || "0"),
        email: mapping.email ? (row[mapping.email] || "").trim() : undefined,
      };

      const issues: string[] = [];
      let status: "pass" | "warning" | "error" = "pass";

      // Missing required fields
      if (!mapped.firstName && !mapped.lastName) {
        issues.push("Missing name");
        status = "error";
      } else if (!mapped.lastName) {
        issues.push("Single name only - no last name detected");
        status = "warning";
      }
      if (!mapped.agencyName) {
        issues.push("Missing agency name");
        status = "error";
      }
      if (isNaN(mapped.responseTimeMins) || !row[mapping.responseTimeMins]) {
        issues.push("Invalid response time");
        status = "error";
      }

      // Response time checks
      if (mapped.responseTimeMins < 0.5 && status !== "error") {
        issues.push("Response time unusually low (< 0.5 min)");
        status = "error";
      }
      if (mapped.responseTimeMins >= 60 && status !== "error") {
        issues.push("Response time >= 60 min (outside qualification)");
        status = "error";
      }

      // Capitalisation warnings
      if (status !== "error") {
        const nameFields = [mapped.firstName, mapped.lastName, mapped.agencyName];
        for (const val of nameFields) {
          if (val === val.toUpperCase() && val.length > 1) {
            issues.push("ALL CAPS detected - check capitalisation");
            status = "warning";
            break;
          }
          if (val === val.toLowerCase() && val.length > 1) {
            issues.push("all lowercase detected - check capitalisation");
            status = "warning";
            break;
          }
        }
      }

      return { rowIndex: idx, row: mapped, status, issues, excluded: false };
    });

    // Check for duplicates
    const nameCount = new Map<string, number[]>();
    results.forEach((r, idx) => {
      const key = `${r.row.firstName.toLowerCase()}-${r.row.lastName.toLowerCase()}`;
      const existing = nameCount.get(key) || [];
      existing.push(idx);
      nameCount.set(key, existing);
    });
    nameCount.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((idx) => {
          results[idx].issues.push("Duplicate PM name");
          if (results[idx].status !== "error") results[idx].status = "error";
        });
      }
    });

    setValidationResults(results);
    setStep("validate");
  }

  function toggleExclude(idx: number) {
    setValidationResults((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, excluded: !r.excluded } : r
      )
    );
  }

  async function submitRun() {
    setSubmitting(true);
    setSubmitError(null);
    const includedRows = validationResults
      .filter((r) => !r.excluded)
      .map((r) => r.row);

    try {
      const res = await fetch("/api/tile-engine/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: includedRows, period }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.skipped) {
          const details = data.skipped
            .map(
              (s: { row: number; name: string; reasons: string[] }) =>
                `Row ${s.row} (${s.name}): ${s.reasons.join(", ")}`
            )
            .join("\n");
          setSubmitError(
            `${data.error || "Validation failed"}\n\n${details}`
          );
        } else if (data.errors) {
          setSubmitError(data.errors.join("\n"));
        } else {
          setSubmitError(data.error || `Server error (${res.status})`);
        }
        setSubmitting(false);
        return;
      }

      setResult(data);
      setStep("complete");
    } catch (err) {
      setSubmitError(
        `Network error: ${err instanceof Error ? err.message : "Failed to reach server"}`
      );
    }
    setSubmitting(false);
  }

  const passCount = validationResults.filter(
    (r) => r.status === "pass" && !r.excluded
  ).length;
  const warnCount = validationResults.filter(
    (r) => r.status === "warning" && !r.excluded
  ).length;
  const errorCount = validationResults.filter(
    (r) => r.status === "error" && !r.excluded
  ).length;
  const includedCount = validationResults.filter((r) => !r.excluded).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1C1E26]">Tile Engine</h1>
        <p className="mt-1 text-sm text-[#9A9BA7]">
          Response Time Champions tile generator
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-[#9A9BA7]">
        {(["upload", "map", "validate", "complete"] as const).map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-300">{">"}</span>}
            <span
              className={
                step === s || (s === "validate" && step === "review")
                  ? "font-semibold text-[#292B32]"
                  : ""
              }
            >
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          </span>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <Upload className="mx-auto mb-4 size-10 text-[#9A9BA7]" />
          <p className="mb-4 text-sm text-[#292B32]">
            Drop a CSV file here or click to browse
          </p>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            id="csv-upload"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          <Button
            className="bg-[#EE0B4F] hover:bg-[#d40945]"
            onClick={() => document.getElementById("csv-upload")?.click()}
          >
            Choose CSV file
          </Button>
        </div>
      )}

      {/* Step 2: Map columns */}
      {step === "map" && parsed && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-100 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-[#292B32]">
              Preview ({parsed.rows.length} rows)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {parsed.headers.map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-medium text-[#9A9BA7]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {parsed.headers.map((h) => (
                        <td key={h} className="px-3 py-2 text-[#292B32]">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-[#292B32]">
              Map columns
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#9A9BA7]">
                  Full Name (single column with first and last name)
                </label>
                <select
                  value={mapping.fullName}
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      fullName: e.target.value,
                      // Clear first/last when full name is set
                      ...(e.target.value ? { firstName: "", lastName: "" } : {}),
                    }))
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#EE0B4F]"
                >
                  <option value="">-- Not using full name column --</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {mapping.fullName && (
                  <p className="mt-1 text-xs text-[#9A9BA7]">
                    Names will be split on spaces: everything before the last word becomes the first name, the last word becomes the last name.
                  </p>
                )}
              </div>

              {!mapping.fullName && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#9A9BA7]">
                      First Name *
                    </label>
                    <select
                      value={mapping.firstName}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, firstName: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#EE0B4F]"
                    >
                      <option value="">-- Select column --</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#9A9BA7]">
                      Last Name *
                    </label>
                    <select
                      value={mapping.lastName}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, lastName: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#EE0B4F]"
                    >
                      <option value="">-- Select column --</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {(
                [
                  { key: "agencyName", label: "Agency Name *" },
                  { key: "responseTimeMins", label: "Response Time (mins) *" },
                  { key: "email", label: "Email (optional)" },
                ] as const
              ).map(({ key, label }) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-[#9A9BA7]">
                    {label}
                  </label>
                  <select
                    value={mapping[key]}
                    onChange={(e) =>
                      setMapping((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#EE0B4F]"
                  >
                    <option value="">-- Select column --</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#9A9BA7]">
                  Period *
                </label>
                <input
                  type="text"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#EE0B4F]"
                  placeholder="e.g. March 2026"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button
              onClick={runValidation}
              disabled={
                (!mapping.fullName && (!mapping.firstName || !mapping.lastName)) ||
                !mapping.agencyName ||
                !mapping.responseTimeMins ||
                !period
              }
              className="bg-[#EE0B4F] hover:bg-[#d40945]"
            >
              Validate <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Validate + Review */}
      {step === "validate" && (
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="flex-1 rounded-xl border border-gray-100 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{passCount}</p>
              <p className="text-xs text-[#9A9BA7]">Passing</p>
            </div>
            <div className="flex-1 rounded-xl border border-gray-100 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{warnCount}</p>
              <p className="text-xs text-[#9A9BA7]">Warnings</p>
            </div>
            <div className="flex-1 rounded-xl border border-gray-100 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-red-500">{errorCount}</p>
              <p className="text-xs text-[#9A9BA7]">Errors</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[#9A9BA7]">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[#9A9BA7]">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[#9A9BA7]">
                    Agency
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[#9A9BA7]">
                    Time
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-[#9A9BA7]">
                    Issues
                  </th>
                </tr>
              </thead>
              <tbody>
                {validationResults.map((r, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-gray-50 ${r.excluded ? "opacity-40" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!r.excluded}
                        onChange={() => toggleExclude(idx)}
                        className="accent-[#EE0B4F]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {r.status === "pass" && (
                        <Check className="size-4 text-green-500" />
                      )}
                      {r.status === "warning" && (
                        <AlertTriangle className="size-4 text-amber-500" />
                      )}
                      {r.status === "error" && (
                        <XCircle className="size-4 text-red-500" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#292B32]">
                      {r.row.firstName} {r.row.lastName}
                    </td>
                    <td className="px-3 py-2 text-[#9A9BA7]">
                      {r.row.agencyName}
                    </td>
                    <td className="px-3 py-2 text-[#292B32]">
                      {r.row.responseTimeMins}m
                    </td>
                    <td className="px-3 py-2 text-xs text-[#9A9BA7]">
                      {r.issues.join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-red-700">
                <XCircle className="size-4" /> Create run failed
              </div>
              <pre className="whitespace-pre-wrap text-xs text-red-600">
                {submitError}
              </pre>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("map")}>
              Back
            </Button>
            <Button
              onClick={submitRun}
              disabled={submitting || includedCount === 0}
              className="bg-[#EE0B4F] hover:bg-[#d40945]"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Creating run...
                </>
              ) : (
                <>
                  Create run ({includedCount} PMs) <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === "complete" && result && (
        <div className="rounded-xl border border-gray-100 bg-white p-8 text-center">
          <Check className="mx-auto mb-4 size-12 text-green-500" />
          <h2 className="mb-2 text-xl font-bold text-[#292B32]">
            Run created successfully
          </h2>
          <p className="mb-6 text-sm text-[#9A9BA7]">
            Period: {period}
          </p>

          <div className="mx-auto mb-6 grid max-w-md grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-lg font-bold text-[#292B32]">
                {result.summary.totalPms}
              </p>
              <p className="text-xs text-[#9A9BA7]">Total PMs</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-lg font-bold text-[#292B32]">
                {result.summary.matchedPms}
              </p>
              <p className="text-xs text-[#9A9BA7]">Existing PMs matched</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-lg font-bold text-[#292B32]">
                {result.summary.newPms}
              </p>
              <p className="text-xs text-[#9A9BA7]">New PMs created</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-lg font-bold text-amber-500">
                {result.summary.missingAssets}
              </p>
              <p className="text-xs text-[#9A9BA7]">Missing assets</p>
            </div>
          </div>

          {result.skipped && result.skipped.length > 0 && (
            <div className="mx-auto max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
              <p className="mb-2 text-sm font-semibold text-amber-700">
                <AlertTriangle className="mr-1 inline size-4" />
                {result.skipped.length} row{result.skipped.length !== 1 ? "s" : ""} skipped
              </p>
              <ul className="space-y-1 text-xs text-amber-600">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    Row {s.row} ({s.name}): {s.reasons.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push("/tile-engine/assets")}
            >
              View asset library
            </Button>
            <Button
              onClick={() =>
                router.push(`/tile-engine/runs/${result.runId}`)
              }
              className="bg-[#EE0B4F] hover:bg-[#d40945]"
            >
              View run details <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
