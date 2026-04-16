"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Check,
  AlertTriangle,
  Building2,
  User,
  Filter,
} from "lucide-react";

type Agency = {
  id: string;
  name: string;
  logoUrl: string | null;
  pmCount: number;
};

type PM = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  agencyId: string;
  agencyName: string;
  headshotUrl: string | null;
};

type ViewMode = "all" | "missing";

export default function AssetLibraryPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [pms, setPms] = useState<PM[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{
    type: "headshot" | "logo";
    entityId: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    const [agencyRes, pmRes] = await Promise.all([
      fetch("/api/tile-engine/agencies"),
      fetch(
        `/api/tile-engine/pms?${selectedAgency ? `agencyId=${selectedAgency}&` : ""}${viewMode === "missing" ? "missingOnly=true" : ""}`
      ),
    ]);
    setAgencies(await agencyRes.json());
    setPms(await pmRes.json());
  }, [selectedAgency, viewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleUpload(file: File) {
    if (!uploadTarget) return;
    setUploading(uploadTarget.entityId);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", uploadTarget.type);
    formData.append("entityId", uploadTarget.entityId);

    await fetch("/api/tile-engine/upload", {
      method: "POST",
      body: formData,
    });

    setUploading(null);
    setUploadTarget(null);
    fetchData();
  }

  function triggerUpload(type: "headshot" | "logo", entityId: string) {
    setUploadTarget({ type, entityId });
    fileInputRef.current?.click();
  }

  const missingAgencyLogos = agencies.filter((a) => !a.logoUrl);
  const missingPmHeadshots = pms.filter((p) => !p.headshotUrl);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1E26]">Asset Library</h1>
          <p className="mt-1 text-sm text-[#9A9BA7]">
            Manage PM headshots and agency logos
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("all")}
          >
            All assets
          </Button>
          <Button
            variant={viewMode === "missing" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("missing")}
            className={
              viewMode === "missing"
                ? "bg-[#EE0B4F] hover:bg-[#d40945]"
                : ""
            }
          >
            <AlertTriangle className="size-3.5" />
            Missing ({missingAgencyLogos.length + missingPmHeadshots.length})
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />

      {/* Agencies */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#292B32]">
          <Building2 className="size-5" />
          Agencies ({agencies.length})
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(viewMode === "missing" ? missingAgencyLogos : agencies).map(
            (agency) => (
              <div
                key={agency.id}
                className={`flex items-center gap-4 rounded-xl border bg-white p-4 transition-colors ${
                  selectedAgency === agency.id
                    ? "border-[#EE0B4F] ring-1 ring-[#EE0B4F]"
                    : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <button
                  onClick={() => triggerUpload("logo", agency.id)}
                  className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100"
                  title="Upload logo"
                >
                  {uploading === agency.id ? (
                    <span className="text-xs text-[#9A9BA7]">...</span>
                  ) : agency.logoUrl ? (
                    <img
                      src={agency.logoUrl}
                      alt={agency.name}
                      className="size-full object-contain p-1"
                    />
                  ) : (
                    <Upload className="size-4 text-[#9A9BA7]" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() =>
                      setSelectedAgency(
                        selectedAgency === agency.id ? null : agency.id
                      )
                    }
                    className="block truncate text-sm font-medium text-[#292B32] hover:text-[#EE0B4F]"
                  >
                    {agency.name}
                  </button>
                  <p className="text-xs text-[#9A9BA7]">
                    {agency.pmCount} PM{agency.pmCount !== 1 ? "s" : ""}
                  </p>
                </div>
                {agency.logoUrl ? (
                  <Check className="size-4 shrink-0 text-green-500" />
                ) : (
                  <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                )}
              </div>
            )
          )}
          {(viewMode === "missing" ? missingAgencyLogos : agencies).length ===
            0 && (
            <p className="col-span-full py-8 text-center text-sm text-[#9A9BA7]">
              {viewMode === "missing"
                ? "All agencies have logos"
                : "No agencies yet. They will be created when you import a CSV."}
            </p>
          )}
        </div>
      </section>

      {/* PMs */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#292B32]">
            <User className="size-5" />
            Property Managers ({pms.length})
          </h2>
          {selectedAgency && (
            <button
              onClick={() => setSelectedAgency(null)}
              className="flex items-center gap-1 text-xs text-[#EE0B4F] hover:underline"
            >
              <Filter className="size-3" />
              Clear filter
            </button>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-left font-medium text-[#9A9BA7]">
                  Photo
                </th>
                <th className="px-4 py-3 text-left font-medium text-[#9A9BA7]">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-[#9A9BA7]">
                  Agency
                </th>
                <th className="px-4 py-3 text-left font-medium text-[#9A9BA7]">
                  Email
                </th>
                <th className="px-4 py-3 text-left font-medium text-[#9A9BA7]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {pms.map((pm) => (
                <tr
                  key={pm.id}
                  className="border-b border-gray-50 last:border-0"
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => triggerUpload("headshot", pm.id)}
                      className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-gray-100"
                      title="Upload headshot"
                    >
                      {uploading === pm.id ? (
                        <span className="text-xs text-[#9A9BA7]">...</span>
                      ) : pm.headshotUrl ? (
                        <img
                          src={pm.headshotUrl}
                          alt={`${pm.firstName} ${pm.lastName}`}
                          className="size-full object-cover"
                        />
                      ) : (
                        <Upload className="size-3.5 text-[#9A9BA7]" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-[#292B32]">
                    {pm.firstName} {pm.lastName}
                  </td>
                  <td className="px-4 py-3 text-[#9A9BA7]">{pm.agencyName}</td>
                  <td className="px-4 py-3 text-[#9A9BA7]">
                    {pm.email || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {pm.headshotUrl ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <Check className="size-3" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="size-3" /> Missing headshot
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {pms.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[#9A9BA7]"
                  >
                    {viewMode === "missing"
                      ? "All PMs have headshots"
                      : "No PMs yet. They will be created when you import a CSV."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
