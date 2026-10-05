"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { activateTemplateVersion, createTemplate, uploadTemplateVersion } from "./actions";
import type { HicFinancingType, HicTemplate, HicTemplateVersion } from "@/app/appointments/send-hic/types";

export function TemplatesClient({
  templates,
  versions,
  financingTypes,
  fieldCountByVersionId,
}: {
  templates: HicTemplate[];
  versions: HicTemplateVersion[];
  financingTypes: HicFinancingType[];
  fieldCountByVersionId: Record<string, number>;
}) {
  const [versionList, setVersionList] = useState(versions);
  const [templateList, setTemplateList] = useState(templates);

  const versionsByTemplateId = useMemo(() => {
    const map = new Map<string, HicTemplateVersion[]>();
    for (const v of versionList) {
      const list = map.get(v.template_id) ?? [];
      list.push(v);
      map.set(v.template_id, list);
    }
    return map;
  }, [versionList]);

  const financingTypeById = useMemo(() => new Map(financingTypes.map((f) => [f.id, f])), [financingTypes]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">HIC Templates</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Upload PDFs and position fields on them. Only one version per template is active (used for real sends) at
          a time — an already-sent HIC keeps using whatever version was active when it was sent, even if you
          activate a newer one later.
        </p>
      </div>

      {templateList.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          versions={(versionsByTemplateId.get(template.id) ?? []).sort((a, b) => b.version - a.version)}
          financingTypeLabel={template.financing_type_id ? financingTypeById.get(template.financing_type_id)?.label ?? "—" : "All financing"}
          fieldCountByVersionId={fieldCountByVersionId}
          onVersionAdded={(v) => setVersionList((prev) => [...prev, v])}
          onVersionActivated={(templateId, versionId) =>
            setVersionList((prev) => prev.map((v) => (v.template_id !== templateId ? v : { ...v, is_active: v.id === versionId })))
          }
        />
      ))}

      <NewTemplateCard
        financingTypes={financingTypes}
        onCreated={(template, version) => {
          setTemplateList((prev) => [...prev, template]);
          setVersionList((prev) => [...prev, version]);
        }}
      />
    </div>
  );
}

function TemplateCard({
  template,
  versions,
  financingTypeLabel,
  fieldCountByVersionId,
  onVersionAdded,
  onVersionActivated,
}: {
  template: HicTemplate;
  versions: HicTemplateVersion[];
  financingTypeLabel: string;
  fieldCountByVersionId: Record<string, number>;
  onVersionAdded: (version: HicTemplateVersion) => void;
  onVersionActivated: (templateId: string, versionId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUploadVersion(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startSaving(async () => {
      const result = await uploadTemplateVersion(template.id, formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        onVersionAdded(result.version);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function handleActivate(versionId: string) {
    setError(null);
    startSaving(async () => {
      const result = await activateTemplateVersion(versionId);
      if (!result.ok) setError(result.error);
      else onVersionActivated(template.id, versionId);
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{template.label}</h2>
          <p className="text-xs text-black/50 dark:text-white/50">
            {template.key} — {template.language ? (template.language === "en" ? "English" : "Spanish") : "Any language"} —{" "}
            {financingTypeLabel}
          </p>
        </div>
        <label className="shrink-0">
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleUploadVersion} disabled={isSaving} className="hidden" />
          <span className="cursor-pointer rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
            Upload new version
          </span>
        </label>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="space-y-1.5">
        {versions.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-2 rounded border border-black/10 px-2 py-1.5 text-sm dark:border-white/10">
            <span>
              v{v.version} — {v.page_count} page{v.page_count === 1 ? "" : "s"} — {fieldCountByVersionId[v.id] ?? 0} field
              {(fieldCountByVersionId[v.id] ?? 0) === 1 ? "" : "s"}
              {v.is_active && <span className="ml-2 rounded-full bg-green-600/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/20 dark:text-green-300">Active</span>}
            </span>
            <span className="flex items-center gap-2">
              <Link href={`/admin/hics/templates/${v.id}/editor`} className="text-xs underline">
                Edit fields
              </Link>
              {!v.is_active && (
                <button type="button" onClick={() => handleActivate(v.id)} disabled={isSaving} className="text-xs underline disabled:opacity-50">
                  Activate
                </button>
              )}
            </span>
          </div>
        ))}
        {versions.length === 0 && <p className="text-sm italic text-black/40 dark:text-white/40">No versions yet.</p>}
      </div>
    </Card>
  );
}

function NewTemplateCard({
  financingTypes,
  onCreated,
}: {
  financingTypes: HicFinancingType[];
  onCreated: (template: HicTemplate, version: HicTemplateVersion) => void;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [language, setLanguage] = useState("");
  const [financingTypeId, setFinancingTypeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF file.");
      return;
    }
    const formData = new FormData();
    formData.set("key", key);
    formData.set("label", label);
    formData.set("language", language);
    formData.set("financingTypeId", financingTypeId);
    formData.set("file", file);
    startSaving(async () => {
      const result = await createTemplate(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.template, result.version);
      setKey("");
      setLabel("");
      setLanguage("");
      setFinancingTypeId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium">New template</h2>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium">Key</label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. hic_en" className="block w-full" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Label</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. HIC (English)" className="block w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium">Language</label>
            <Select value={language} onChange={(e) => setLanguage(e.target.value)} className="block w-full">
              <option value="">Any (e.g. attachments)</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Financing type</label>
            <Select value={financingTypeId} onChange={(e) => setFinancingTypeId(e.target.value)} className="block w-full">
              <option value="">All financing types</option>
              {financingTypes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">PDF file</label>
          <input ref={fileInputRef} type="file" accept="application/pdf" className="block text-sm" />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? "Creating…" : "Create template"}
        </Button>
      </form>
    </Card>
  );
}
