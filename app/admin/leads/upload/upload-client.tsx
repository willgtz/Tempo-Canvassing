"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import {
  detectColumnMap,
  FIELD_LABELS,
  fullAddress,
  missingRequiredColumns,
  rowsToPreview,
  type CsvField,
} from "./parse-csv";
import type { PreviewRow } from "./types";
import { commitLeadBatch, type CommitRow } from "./actions";
import { MAX_ROWS } from "./constants";

type Phase = "idle" | "ready" | "committing" | "processing" | "done";

type Progress = {
  total: number;
  geocoded: number;
  rooftop: number;
  failed: number;
};

type Disposition = {
  id: string;
  name: string;
  color: string;
  is_default: boolean;
};

const POLL_MS = 1500;

function toCommitRow(row: PreviewRow): CommitRow {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    addressLine: row.addressLine,
    city: row.city,
    state: row.state,
    zipcode: row.zipcode,
    phone: row.phone,
    email: row.email,
    priorSaleDate: row.priorSaleDate,
  };
}

export function UploadLeadsClient({ dispositions }: { dispositions: Disposition[] }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [columnMap, setColumnMap] = useState<Partial<Record<CsvField, string>>>({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dispositionId, setDispositionId] = useState<string>(
    () => dispositions.find((d) => d.is_default)?.id ?? ""
  );
  const [isCommitting, startCommit] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = useMemo(() => rows.filter((r) => !r.validationError), [rows]);
  const skippedRows = useMemo(() => rows.filter((r) => r.validationError), [rows]);

  useEffect(() => {
    if (phase !== "processing" || !batchId) return;

    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/leads/batches/${batchId}/progress`);
      if (!res.ok || cancelled) return;
      const data: Progress = await res.json();
      if (cancelled) return;
      setProgress(data);
      if (data.total > 0 && data.geocoded >= data.total) {
        setPhase("done");
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase, batchId]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setCommitError(null);
    setFilename(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.meta.fields || results.meta.fields.length === 0) {
          setParseError("Couldn't find a header row in this CSV.");
          return;
        }

        if (results.data.length > MAX_ROWS) {
          setParseError(
            `This file has ${results.data.length} rows, which exceeds the ${MAX_ROWS}-row limit per upload. ` +
              `Split it into smaller files and upload each separately.`
          );
          return;
        }

        const fieldMap = detectColumnMap(results.meta.fields);
        setColumnMap(fieldMap);

        const missingColumns = missingRequiredColumns(fieldMap);
        if (missingColumns.length > 0) {
          setParseError(
            `Couldn't find a column for: ${missingColumns.map((f) => FIELD_LABELS[f]).join(", ")}. ` +
              `Detected headers: ${results.meta.fields.join(", ")}.`
          );
          return;
        }

        const preview = rowsToPreview(results.data, fieldMap);
        if (preview.length === 0) {
          setParseError("This CSV has no data rows.");
          return;
        }

        setRows(preview);
        setPhase("ready");
      },
      error: (err) => {
        setParseError(err.message);
      },
    });
  }

  function handleReset() {
    setPhase("idle");
    setRows([]);
    setFilename("");
    setParseError(null);
    setCommitError(null);
    setColumnMap({});
    setBatchId(null);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleConfirm() {
    setCommitError(null);
    setPhase("committing");
    startCommit(async () => {
      const result = await commitLeadBatch(filename, validRows.map(toCommitRow), dispositionId || null);
      if (!result.ok) {
        setCommitError(result.error);
        setPhase("ready");
        return;
      }
      setBatchId(result.batchId);
      setProgress({ total: result.insertedCount, geocoded: 0, rooftop: 0, failed: 0 });
      setPhase("processing");
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Upload Leads</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          CSV columns recognized: first name, last name, address, city, state,
          zip, phone, email. Address and zip are required. Max {MAX_ROWS} rows
          per upload.
        </p>
      </div>

      {phase === "idle" && (
        <div className="rounded-lg border border-dashed border-black/20 p-8 text-center dark:border-white/20">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="text-sm"
          />
          {parseError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{parseError}</p>
          )}
        </div>
      )}

      {(phase === "ready" || phase === "committing") && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span>
              <strong>{filename}</strong> — {rows.length} row
              {rows.length === 1 ? "" : "s"}
              {skippedRows.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {" "}
                  ({skippedRows.length} skipped — missing address/zip)
                </span>
              )}
            </span>
            <button
              onClick={handleReset}
              className="rounded border border-black/15 px-3 py-1 text-xs dark:border-white/20"
              disabled={isCommitting}
            >
              Start over
            </button>
          </div>

          <details className="rounded-lg border border-black/10 p-3 text-xs text-black/60 dark:border-white/10 dark:text-white/60">
            <summary className="cursor-pointer select-none font-medium">
              Detected columns
            </summary>
            <ul className="mt-2 space-y-0.5">
              {(Object.keys(FIELD_LABELS) as CsvField[]).map((field) => (
                <li key={field}>
                  {FIELD_LABELS[field]}:{" "}
                  {columnMap[field] ? (
                    <span className="text-black/80 dark:text-white/80">
                      {columnMap[field]}
                    </span>
                  ) : (
                    <span className="italic">not found</span>
                  )}
                </li>
              ))}
            </ul>
          </details>

          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium">CSV Zip</th>
                  <th className="px-3 py-2 font-medium">Sold Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className="border-t border-black/5 dark:border-white/10"
                  >
                    <td className="px-3 py-2">
                      {[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.validationError ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {row.validationError}
                        </span>
                      ) : (
                        fullAddress(row)
                      )}
                    </td>
                    <td className="px-3 py-2">{row.zipcode || "—"}</td>
                    <td className="px-3 py-2">{row.priorSaleDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Apply disposition to all {validRows.length} lead
                  {validRows.length === 1 ? "" : "s"}
                </label>
                <select
                  value={dispositionId}
                  onChange={(e) => setDispositionId(e.target.value)}
                  className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
                >
                  <option value="">No disposition</option>
                  {dispositions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleConfirm}
                disabled={isCommitting || validRows.length === 0}
                className="shrink-0 rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {isCommitting
                  ? "Inserting…"
                  : `Confirm & Insert ${validRows.length} Lead${validRows.length === 1 ? "" : "s"}`}
              </button>
            </div>
            <p className="text-sm text-black/60 dark:text-white/60">
              Addresses will be geocoded in the background right after — no
              need to wait here.
              {skippedRows.length > 0 &&
                ` ${skippedRows.length} row${skippedRows.length === 1 ? "" : "s"} will be skipped.`}
            </p>
          </div>

          {commitError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Insert failed: {commitError}
            </p>
          )}
        </div>
      )}

      {(phase === "processing" || phase === "done") && progress && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span>
              <strong>{filename}</strong> — batch inserted, geocoding{" "}
              {phase === "done" ? "complete" : "in progress"}
            </span>
            <button
              onClick={handleReset}
              className="rounded border border-black/15 px-3 py-1 text-xs dark:border-white/20"
            >
              Upload another file
            </button>
          </div>

          <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex justify-between text-sm">
              <span>
                {progress.geocoded} / {progress.total} geocoded
              </span>
              <span>
                {progress.total > 0
                  ? Math.round((progress.geocoded / progress.total) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full bg-black transition-all dark:bg-white"
                style={{
                  width: `${progress.total > 0 ? (progress.geocoded / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {phase === "done" && (
            <div className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
              <p className="font-medium">Done.</p>
              <ul className="mt-2 space-y-1 text-black/70 dark:text-white/70">
                <li>{progress.rooftop} rooftop-accurate</li>
                <li>
                  {progress.geocoded - progress.rooftop - progress.failed} approximate
                  (verify before dispatching a rep)
                </li>
                <li>{progress.failed} couldn&apos;t be geocoded (inserted with no lat/lng)</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
