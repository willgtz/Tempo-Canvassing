"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rnd } from "react-rnd";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { PdfPageCanvas } from "@/components/slideshow/pdf-page-canvas";
import { duplicateTemplateFields, saveTemplateFields, type TemplateFieldInput } from "../../actions";
import type {
  HicTemplate,
  HicTemplateField,
  HicTemplateFieldSignerRole,
  HicTemplateFieldType,
  HicTemplateVersion,
} from "@/app/appointments/send-hic/types";

// Same point-space constants and PDF <-> screen conversion math already
// proven on the public signing page's click-to-sign overlay — every
// real HIC template is standard US Letter, origin bottom-left.
const PAGE_WIDTH_PT = 612;
const PAGE_HEIGHT_PT = 792;

// Known field_keys from scripts/seed-hic-template-fields.mjs / the
// fill-hic-package.ts resolver — a starting list, not an enforced enum
// (the field below stays a free-text input, this just autocompletes).
const KNOWN_FIELD_KEYS = [
  "customer_name", "customer_name_p7", "primary_buyer_name", "buyer_name_p5", "henderson_owner_name", "supplement_homeowner_name",
  "primary_buyer_phone", "primary_buyer_email", "henderson_email", "henderson_phone",
  "co_buyer_name", "co_buyer_name_p5", "co_buyer_phone", "co_buyer_email",
  "install_street", "install_city", "install_state", "install_zip", "henderson_address",
  "system_size_kw", "system_size_dc", "est_production_first_year", "est_first_year_production_p3",
  "first_year_monthly_payment", "escalator", "kwh_rate", "contract_price", "total_loan_amount",
  "fixed_apr", "loan_term_years", "payment_after_36_months",
  "estimated_tax_credit", "amount_due_at_signing",
  "panel_brand", "number_of_panels",
  "inverter_make_model", "inverter_quantity", "racking_manufacturer", "racking_model",
  "rep_name_p5", "rep_name_p7", "henderson_contractor_name",
  "customer_signature_p1", "customer_signature_p7", "buyer_signature_p5", "co_buyer_signature_p5",
  "rep_signature_p5", "rep_signature_p7", "supplement_homeowner_signature", "henderson_signature",
  "buyer_initials", "co_buyer_initials",
  "customer_date_p1", "customer_date_p7", "buyer_date_p5", "co_buyer_date_p5", "rep_date_p5", "rep_date_p7",
  "supplement_homeowner_date", "henderson_date",
  "language_checkbox",
];

const FIELD_TYPES: HicTemplateFieldType[] = ["text", "signature", "initials", "date", "checkbox", "static_text"];
const SIGNER_ROLES: HicTemplateFieldSignerRole[] = ["none", "homeowner", "co_borrower", "rep"];
const FORMATS = ["", "currency", "currency_no_symbol", "kw", "kwh", "kwh_rate", "percent"];

const FIELD_TYPE_COLOR: Record<HicTemplateFieldType, string> = {
  text: "border-blue-500 bg-blue-500/10",
  signature: "border-purple-500 bg-purple-500/10",
  initials: "border-amber-500 bg-amber-500/10",
  date: "border-green-500 bg-green-500/10",
  checkbox: "border-pink-500 bg-pink-500/10",
  static_text: "border-black/30 bg-black/5 dark:border-white/30 dark:bg-white/10",
};

type EditableField = TemplateFieldInput & { clientId: string };

function toFieldInput(f: EditableField): TemplateFieldInput {
  return {
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    field_key: f.field_key,
    field_type: f.field_type,
    signer_role: f.signer_role,
    font_size: f.font_size,
    alignment: f.alignment,
    required: f.required,
    format: f.format,
    show_only_if: f.show_only_if,
    sort_order: f.sort_order,
  };
}

function toEditable(f: HicTemplateField): EditableField {
  return {
    clientId: f.id,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    field_key: f.field_key,
    field_type: f.field_type,
    signer_role: f.signer_role,
    font_size: f.font_size,
    alignment: f.alignment,
    required: f.required,
    format: f.format,
    show_only_if: f.show_only_if,
    sort_order: f.sort_order,
  };
}

export function EditorClient({
  version,
  template,
  initialFields,
  signedUrl,
  otherVersions,
  allTemplates,
}: {
  version: HicTemplateVersion;
  template: HicTemplate;
  initialFields: HicTemplateField[];
  signedUrl: string;
  otherVersions: HicTemplateVersion[];
  allTemplates: HicTemplate[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<EditableField[]>(() => initialFields.map(toEditable));
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [duplicateSourceVersionId, setDuplicateSourceVersionId] = useState("");

  const templateByVersionId = useMemo(() => {
    const map = new Map<string, HicTemplate>();
    for (const v of [version, ...otherVersions]) {
      const t = v.template_id === template.id ? template : allTemplates.find((t) => t.id === v.template_id);
      if (t) map.set(v.id, t);
    }
    return map;
  }, [version, otherVersions, template, allTemplates]);

  const scale = canvasSize ? canvasSize.width / PAGE_WIDTH_PT : null;
  const fieldsOnPage = fields.filter((f) => f.page === currentPage);
  const selected = fields.find((f) => f.clientId === selectedClientId) ?? null;
  const unlabeledCount = fields.filter((f) => !f.field_key.trim()).length;

  function update(clientId: string, patch: Partial<EditableField>) {
    setFields((prev) => prev.map((f) => (f.clientId === clientId ? { ...f, ...patch } : f)));
    setSaved(false);
  }

  function handleAddField() {
    const clientId = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const defaultWidthPt = 120;
    const defaultHeightPt = 16;
    const next: EditableField = {
      clientId,
      page: currentPage,
      x: 72,
      y: PAGE_HEIGHT_PT - 100,
      width: defaultWidthPt,
      height: defaultHeightPt,
      field_key: "",
      field_type: "text",
      signer_role: "none",
      font_size: 10,
      alignment: "left",
      required: true,
      format: null,
      show_only_if: null,
      sort_order: fields.length,
    };
    setFields((prev) => [...prev, next]);
    setSelectedClientId(clientId);
    setSaved(false);
  }

  function handleDeleteSelected() {
    if (!selectedClientId) return;
    setFields((prev) => prev.filter((f) => f.clientId !== selectedClientId));
    setSelectedClientId(null);
    setSaved(false);
  }

  function handleDragStop(clientId: string, x: number, y: number) {
    if (!scale) return;
    const field = fields.find((f) => f.clientId === clientId);
    if (!field) return;
    const pdfX = x / scale;
    const pdfY = PAGE_HEIGHT_PT - y / scale - field.height;
    update(clientId, { x: Math.round(pdfX * 10) / 10, y: Math.round(pdfY * 10) / 10 });
  }

  function handleResizeStop(clientId: string, widthPx: number, heightPx: number, x: number, y: number) {
    if (!scale) return;
    const width = widthPx / scale;
    const height = heightPx / scale;
    const pdfX = x / scale;
    const pdfY = PAGE_HEIGHT_PT - y / scale - height;
    update(clientId, {
      width: Math.round(width * 10) / 10,
      height: Math.round(height * 10) / 10,
      x: Math.round(pdfX * 10) / 10,
      y: Math.round(pdfY * 10) / 10,
    });
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startSaving(async () => {
      const result = await saveTemplateFields(version.id, fields.map(toFieldInput));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFields(result.fields.map(toEditable));
      setSaved(true);
    });
  }

  function handleDuplicateFrom() {
    if (!duplicateSourceVersionId) return;
    setError(null);
    setSaved(false);
    startSaving(async () => {
      const result = await duplicateTemplateFields(duplicateSourceVersionId, version.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFields(result.fields.map(toEditable));
      setSaved(true);
    });
  }

  function handlePreview() {
    router.push(`/dev/hic-template-preview`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">
            {template.label} — v{version.version}
          </h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {version.page_count} page{version.page_count === 1 ? "" : "s"} —{" "}
            {version.is_active ? "Active (used for real sends)" : "Draft — not used until activated"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handlePreview}>
            Preview tool
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save fields"}
          </Button>
        </div>
      </div>

      {saved && !error && <p className="text-sm text-green-600 dark:text-green-400">Saved.</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {unlabeledCount > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {unlabeledCount} field{unlabeledCount === 1 ? "" : "s"} still {unlabeledCount === 1 ? "needs" : "need"} a field
          key (shown with a dashed border below) — fine to save as-is, but required before this version can be activated.
        </p>
      )}

      {otherVersions.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
          <span className="text-xs font-medium">Copy fields from:</span>
          <Select value={duplicateSourceVersionId} onChange={(e) => setDuplicateSourceVersionId(e.target.value)}>
            <option value="">Pick a version…</option>
            {otherVersions.map((v) => (
              <option key={v.id} value={v.id}>
                {templateByVersionId.get(v.id)?.label ?? "—"} v{v.version}
              </option>
            ))}
          </Select>
          <Button type="button" variant="secondary" size="sm" onClick={handleDuplicateFrom} disabled={isSaving || !duplicateSourceVersionId}>
            Copy (overwrites current fields)
          </Button>
        </div>
      )}

      {version.page_count > 1 && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: version.page_count }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setCurrentPage(p)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                p === currentPage
                  ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                  : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              )}
            >
              Page {p}
              {fields.some((f) => f.page === p) && (
                <span className="ml-1 opacity-70">({fields.filter((f) => f.page === p).length})</span>
              )}
              {fields.some((f) => f.page === p && !f.field_key.trim()) && (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Button type="button" size="sm" variant="secondary" onClick={handleAddField}>
            + Add field on this page
          </Button>
          <div className="relative rounded border border-black/10 dark:border-white/10" style={{ userSelect: "none" }}>
            <PdfPageCanvas fileUrl={signedUrl} page={currentPage} onLoaded={setCanvasSize} />
            {scale &&
              fieldsOnPage.map((field) => {
                const left = field.x * scale;
                const top = (PAGE_HEIGHT_PT - (field.y + field.height)) * scale;
                const width = field.width * scale;
                const height = field.height * scale;
                const isSelected = field.clientId === selectedClientId;
                return (
                  <Rnd
                    key={field.clientId}
                    size={{ width, height }}
                    position={{ x: left, y: top }}
                    bounds="parent"
                    dragGrid={[2, 2]}
                    resizeGrid={[2, 2]}
                    onDragStop={(_e, d) => handleDragStop(field.clientId, d.x, d.y)}
                    onResizeStop={(_e, _dir, ref, _delta, position) =>
                      handleResizeStop(field.clientId, ref.offsetWidth, ref.offsetHeight, position.x, position.y)
                    }
                    onMouseDown={() => setSelectedClientId(field.clientId)}
                    className={cn(
                      "flex items-center overflow-hidden text-[10px] leading-none",
                      field.field_key.trim() ? "rounded-sm border" : "rounded-sm border-2 border-dashed border-red-500 bg-red-500/10",
                      field.field_key.trim() ? FIELD_TYPE_COLOR[field.field_type] : "",
                      isSelected ? "ring-2 ring-blue-600" : ""
                    )}
                  >
                    <span className="truncate px-1">{field.field_key || "(no key)"}</span>
                  </Rnd>
                );
              })}
          </div>
        </div>

        <div className="w-64 shrink-0 space-y-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
          <h2 className="text-sm font-medium">Field properties</h2>
          {!selected && <p className="text-xs text-black/50 dark:text-white/50">Click a box to edit it, or add a new one.</p>}
          {selected && (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Field key</label>
                <Input
                  value={selected.field_key}
                  onChange={(e) => update(selected.clientId, { field_key: e.target.value })}
                  list="known-field-keys"
                  className="block w-full"
                />
                <datalist id="known-field-keys">
                  {KNOWN_FIELD_KEYS.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <Select value={selected.field_type} onChange={(e) => update(selected.clientId, { field_type: e.target.value as HicTemplateFieldType })} className="block w-full">
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Signer role</label>
                <Select value={selected.signer_role} onChange={(e) => update(selected.clientId, { signer_role: e.target.value as HicTemplateFieldSignerRole })} className="block w-full">
                  {SIGNER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Font size</label>
                  <Input type="number" value={selected.font_size} onChange={(e) => update(selected.clientId, { font_size: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Alignment</label>
                  <Select value={selected.alignment} onChange={(e) => update(selected.clientId, { alignment: e.target.value as "left" | "center" | "right" })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Format</label>
                <Select value={selected.format ?? ""} onChange={(e) => update(selected.clientId, { format: e.target.value || null })} className="block w-full">
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f || "(plain text)"}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Show only if (e.g. has_co_borrower)</label>
                <Input
                  value={selected.show_only_if ?? ""}
                  onChange={(e) => update(selected.clientId, { show_only_if: e.target.value || null })}
                  className="block w-full"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={selected.required} onChange={(e) => update(selected.clientId, { required: e.target.checked })} className="h-4 w-4" />
                Required
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs text-black/50 dark:text-white/50">
                <span>x: {selected.x.toFixed(1)}</span>
                <span>y: {selected.y.toFixed(1)}</span>
                <span>w: {selected.width.toFixed(1)}</span>
                <span>h: {selected.height.toFixed(1)}</span>
              </div>
              <button type="button" onClick={handleDeleteSelected} className="text-xs text-red-600 underline dark:text-red-400">
                Delete this field
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
