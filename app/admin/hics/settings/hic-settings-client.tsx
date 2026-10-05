"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  addNotificationRecipient,
  addPackageRule,
  addPanelOption,
  deleteNotificationRecipient,
  deletePackageRule,
  deletePanelOption,
  saveEmailTemplate,
  saveEquipmentSupplementDefaults,
  saveFormulaDefaults,
  saveOptionLists,
  saveReminderSettings,
  updateNotificationRecipientFlags,
  updatePackageRule,
  updatePanelOption,
} from "./actions";
import type { HicSettings } from "@/lib/hic/settings";
import type {
  HicEmailTemplate,
  HicEmailTemplateType,
  HicEquipmentSupplementDefaults,
  HicFinancingType,
  HicNotificationRecipient,
  HicPackageRule,
  HicPanelOption,
} from "@/app/appointments/send-hic/types";

type Profile = { id: string; full_name: string };

const EMAIL_TYPE_LABEL: Record<HicEmailTemplateType, string> = {
  signer_invite: "Signer invite",
  reminder: "Reminder",
  signed_confirmation: "Signed confirmation (to signer)",
  viewed_notify: "Viewed (internal notify)",
  signed_notify: "Signed (internal notify)",
  declined_notify: "Declined (internal notify)",
  voided_notify: "Voided (internal notify)",
};

function SaveRow({
  isSaving,
  saved,
  error,
  onSave,
  label = "Save",
}: {
  isSaving: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={onSave} disabled={isSaving}>
        {isSaving ? "Saving…" : label}
      </Button>
      {saved && !error && <span className="text-sm text-green-700 dark:text-green-500">Saved.</span>}
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}

export function HicSettingsClient({
  settings,
  financingTypes,
  panelOptions,
  packageRules,
  notificationRecipients,
  profiles,
  emailTemplates,
  equipmentDefaults,
}: {
  settings: HicSettings;
  financingTypes: HicFinancingType[];
  panelOptions: HicPanelOption[];
  packageRules: HicPackageRule[];
  notificationRecipients: HicNotificationRecipient[];
  profiles: Profile[];
  emailTemplates: HicEmailTemplate[];
  equipmentDefaults: HicEquipmentSupplementDefaults;
}) {
  const financingTypeById = useMemo(() => new Map(financingTypes.map((f) => [f.id, f])), [financingTypes]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">HIC Settings</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Every setting here takes effect immediately on the next HIC sent or the next reminder run — no deploy
          needed. Changes are logged with who changed what.
        </p>
      </div>

      <RemindersCard settings={settings} />
      <FormulaDefaultsCard settings={settings} />
      <OptionListsCard settings={settings} />
      <PanelsCard financingTypes={financingTypes} panelOptions={panelOptions} financingTypeById={financingTypeById} />
      <EquipmentSupplementCard equipmentDefaults={equipmentDefaults} />
      <PackageRulesCard financingTypes={financingTypes} packageRules={packageRules} financingTypeById={financingTypeById} />
      <NotificationRecipientsCard notificationRecipients={notificationRecipients} profiles={profiles} />
      <EmailTemplatesCard emailTemplates={emailTemplates} />
    </div>
  );
}

// ------------------------------------------------------------
function RemindersCard({ settings }: { settings: HicSettings }) {
  const [remindersEnabled, setRemindersEnabled] = useState(settings.remindersEnabled);
  const [reminderDaysBetween, setReminderDaysBetween] = useState(String(settings.reminderDaysBetween));
  const [reminderMaxCount, setReminderMaxCount] = useState(String(settings.reminderMaxCount));
  const [linkExpirationDays, setLinkExpirationDays] = useState(String(settings.linkExpirationDays));
  const [repsCanDownloadSigned, setRepsCanDownloadSigned] = useState(settings.repsCanDownloadSigned);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startSaving(async () => {
      const result = await saveReminderSettings({
        remindersEnabled,
        reminderDaysBetween: Number(reminderDaysBetween),
        reminderMaxCount: Number(reminderMaxCount),
        linkExpirationDays: Number(linkExpirationDays),
        repsCanDownloadSigned,
      });
      if (!result.ok) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium">Reminders &amp; link expiration</h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={remindersEnabled} onChange={(e) => { setRemindersEnabled(e.target.checked); setSaved(false); }} className="h-4 w-4" />
        Automatic reminders enabled
      </label>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Days between reminders</label>
          <Input type="number" min={1} value={reminderDaysBetween} onChange={(e) => { setReminderDaysBetween(e.target.value); setSaved(false); }} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Max reminders</label>
          <Input type="number" min={0} value={reminderMaxCount} onChange={(e) => { setReminderMaxCount(e.target.value); setSaved(false); }} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Link expires after (days)</label>
          <Input type="number" min={1} value={linkExpirationDays} onChange={(e) => { setLinkExpirationDays(e.target.value); setSaved(false); }} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={repsCanDownloadSigned} onChange={(e) => { setRepsCanDownloadSigned(e.target.checked); setSaved(false); }} className="h-4 w-4" />
        Reps can download their own signed HICs
      </label>
      <SaveRow isSaving={isSaving} saved={saved} error={error} onSave={handleSave} />
    </Card>
  );
}

// ------------------------------------------------------------
function FormulaDefaultsCard({ settings }: { settings: HicSettings }) {
  const [degradationPct, setDegradationPct] = useState(String(settings.degradationRate * 100));
  const [termYears, setTermYears] = useState(String(settings.termYears));
  const [defaultTaxCredit, setDefaultTaxCredit] = useState(String(settings.defaultTaxCredit));
  const [defaultAmountDue, setDefaultAmountDue] = useState(String(settings.defaultAmountDueAtSigning));
  const [defaultContractorName, setDefaultContractorName] = useState(settings.defaultContractorName);
  const [mismatchThreshold, setMismatchThreshold] = useState(String(settings.monthlyPaymentMismatchThreshold));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startSaving(async () => {
      const result = await saveFormulaDefaults({
        degradationRate: Number(degradationPct) / 100,
        termYears: Number(termYears),
        defaultTaxCredit: Number(defaultTaxCredit),
        defaultAmountDueAtSigning: Number(defaultAmountDue),
        defaultContractorName,
        monthlyPaymentMismatchThreshold: Number(mismatchThreshold),
      });
      if (!result.ok) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium">Contract-price formula &amp; defaults</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Degradation and term feed the 25-year contract-price calculation directly — change these only if LightReach&apos;s
        own formula changes.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Annual degradation (%)</label>
          <Input type="number" step="0.01" value={degradationPct} onChange={(e) => { setDegradationPct(e.target.value); setSaved(false); }} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Term (years)</label>
          <Input type="number" min={1} value={termYears} onChange={(e) => { setTermYears(e.target.value); setSaved(false); }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Default estimated tax credit</label>
          <Input type="number" step="0.01" value={defaultTaxCredit} onChange={(e) => { setDefaultTaxCredit(e.target.value); setSaved(false); }} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Default amount due at signing</label>
          <Input type="number" step="0.01" value={defaultAmountDue} onChange={(e) => { setDefaultAmountDue(e.target.value); setSaved(false); }} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">Default contractor name</label>
        <Input value={defaultContractorName} onChange={(e) => { setDefaultContractorName(e.target.value); setSaved(false); }} className="block w-full" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">Monthly-payment mismatch warning threshold ($)</label>
        <Input type="number" step="0.01" value={mismatchThreshold} onChange={(e) => { setMismatchThreshold(e.target.value); setSaved(false); }} className="w-40" />
      </div>
      <SaveRow isSaving={isSaving} saved={saved} error={error} onSave={handleSave} />
    </Card>
  );
}

// ------------------------------------------------------------
function OptionListsCard({ settings }: { settings: HicSettings }) {
  const [escalatorText, setEscalatorText] = useState(settings.escalatorOptions.map((n) => (n * 100).toFixed(2)).join(", "));
  const [kwhRateText, setKwhRateText] = useState(settings.kwhRateOptions.map((n) => n.toFixed(3)).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function parseList(text: string): number[] | null {
    const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
    const nums = parts.map(Number);
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return nums;
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    const escalatorPcts = parseList(escalatorText);
    const kwhRates = parseList(kwhRateText);
    if (!escalatorPcts || !kwhRates) {
      setError("Enter comma-separated numbers only.");
      return;
    }
    startSaving(async () => {
      const result = await saveOptionLists(escalatorPcts.map((n) => n / 100), kwhRates);
      if (!result.ok) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium">Escalator &amp; kWh-rate choices</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        The dropdown choices reps see when filling out a HIC. Comma-separated.
      </p>
      <div className="space-y-1">
        <label className="text-xs font-medium">Escalator options (%)</label>
        <Input value={escalatorText} onChange={(e) => { setEscalatorText(e.target.value); setSaved(false); }} placeholder="0, 1.99, 2.99" className="block w-full" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">kWh-rate options ($)</label>
        <Input value={kwhRateText} onChange={(e) => { setKwhRateText(e.target.value); setSaved(false); }} placeholder="0, 0.100, 0.105, 0.110" className="block w-full" />
      </div>
      <SaveRow isSaving={isSaving} saved={saved} error={error} onSave={handleSave} />
    </Card>
  );
}

// ------------------------------------------------------------
function PanelsCard({
  financingTypes,
  panelOptions,
  financingTypeById,
}: {
  financingTypes: HicFinancingType[];
  panelOptions: HicPanelOption[];
  financingTypeById: Map<string, HicFinancingType>;
}) {
  const [panels, setPanels] = useState(panelOptions);
  const [financingTypeId, setFinancingTypeId] = useState(financingTypes[0]?.id ?? "");
  const [modelName, setModelName] = useState("");
  const [wattageW, setWattageW] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleAdd() {
    setError(null);
    if (!financingTypeId) {
      setError("Pick a financing type.");
      return;
    }
    startSaving(async () => {
      const result = await addPanelOption(financingTypeId, modelName, Number(wattageW));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPanels((prev) => [...prev, result.panel]);
      setModelName("");
      setWattageW("");
    });
  }

  function handleToggleActive(panel: HicPanelOption) {
    setError(null);
    startSaving(async () => {
      const result = await updatePanelOption(panel.id, panel.model_name, panel.wattage_w, !panel.is_active);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPanels((prev) => prev.map((p) => (p.id === panel.id ? { ...p, is_active: !p.is_active } : p)));
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startSaving(async () => {
      const result = await deletePanelOption(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPanels((prev) => prev.filter((p) => p.id !== id));
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium">Panels per financing type</h2>
      <div className="space-y-1.5">
        {panels.map((panel) => (
          <div key={panel.id} className="flex items-center justify-between gap-2 rounded border border-black/10 px-2 py-1.5 text-sm dark:border-white/10">
            <span>
              <span className="text-black/50 dark:text-white/50">{financingTypeById.get(panel.financing_type_id)?.label ?? "—"}:</span>{" "}
              {panel.model_name} ({panel.wattage_w}W){!panel.is_active && <span className="ml-1 text-xs text-black/40 dark:text-white/40">(inactive)</span>}
            </span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => handleToggleActive(panel)} disabled={isSaving} className="text-xs underline disabled:opacity-50">
                {panel.is_active ? "Deactivate" : "Activate"}
              </button>
              <button type="button" onClick={() => handleDelete(panel.id)} disabled={isSaving} className="text-xs text-red-600 underline disabled:opacity-50 dark:text-red-400">
                Delete
              </button>
            </span>
          </div>
        ))}
        {panels.length === 0 && <p className="text-sm italic text-black/40 dark:text-white/40">No panels configured.</p>}
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-black/10 pt-3 dark:border-white/10">
        <Select value={financingTypeId} onChange={(e) => setFinancingTypeId(e.target.value)}>
          {financingTypes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </Select>
        <Input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Model name" className="w-48" />
        <Input type="number" value={wattageW} onChange={(e) => setWattageW(e.target.value)} placeholder="Watts" className="w-24" />
        <Button size="sm" variant="secondary" onClick={handleAdd} disabled={isSaving}>
          Add panel
        </Button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}

// ------------------------------------------------------------
function EquipmentSupplementCard({ equipmentDefaults }: { equipmentDefaults: HicEquipmentSupplementDefaults }) {
  const [inverterMakeModel, setInverterMakeModel] = useState(equipmentDefaults.inverter_make_model);
  const [inverterQuantity, setInverterQuantity] = useState(String(equipmentDefaults.inverter_quantity));
  const [rackingManufacturer, setRackingManufacturer] = useState(equipmentDefaults.racking_manufacturer);
  const [rackingModel, setRackingModel] = useState(equipmentDefaults.racking_model);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startSaving(async () => {
      const result = await saveEquipmentSupplementDefaults({
        inverterMakeModel,
        inverterQuantity: Number(inverterQuantity),
        rackingManufacturer,
        rackingModel,
      });
      if (!result.ok) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium">Equipment supplement defaults</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Stamped onto the LightReach equipment supplement for every new HIC.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Inverter make/model</label>
          <Input value={inverterMakeModel} onChange={(e) => { setInverterMakeModel(e.target.value); setSaved(false); }} className="block w-full" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Inverter quantity</label>
          <Input type="number" min={1} value={inverterQuantity} onChange={(e) => { setInverterQuantity(e.target.value); setSaved(false); }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Racking manufacturer</label>
          <Input value={rackingManufacturer} onChange={(e) => { setRackingManufacturer(e.target.value); setSaved(false); }} className="block w-full" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Racking model</label>
          <Input value={rackingModel} onChange={(e) => { setRackingModel(e.target.value); setSaved(false); }} className="block w-full" />
        </div>
      </div>
      <SaveRow isSaving={isSaving} saved={saved} error={error} onSave={handleSave} />
    </Card>
  );
}

// ------------------------------------------------------------
function PackageRulesCard({
  financingTypes,
  packageRules,
  financingTypeById,
}: {
  financingTypes: HicFinancingType[];
  packageRules: HicPackageRule[];
  financingTypeById: Map<string, HicFinancingType>;
}) {
  const [rules, setRules] = useState(packageRules);
  const [templateKey, setTemplateKey] = useState("");
  const [newFinancingTypeId, setNewFinancingTypeId] = useState("");
  const [conditionType, setConditionType] = useState<"always" | "city_in_list">("always");
  const [cityListText, setCityListText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleAdd() {
    setError(null);
    if (!templateKey.trim()) {
      setError("Template key is required.");
      return;
    }
    startSaving(async () => {
      const result = await addPackageRule({
        templateKey,
        financingTypeId: newFinancingTypeId || null,
        conditionType,
        cityList: conditionType === "city_in_list" ? cityListText.split(",") : null,
        isEnabled: true,
        sortOrder: rules.length,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRules((prev) => [...prev, result.rule]);
      setTemplateKey("");
      setCityListText("");
    });
  }

  function handleToggleEnabled(rule: HicPackageRule) {
    setError(null);
    startSaving(async () => {
      const result = await updatePackageRule(rule.id, {
        templateKey: rule.template_key,
        financingTypeId: rule.financing_type_id,
        conditionType: rule.condition_type,
        cityList: rule.city_list,
        isEnabled: !rule.is_enabled,
        sortOrder: rule.sort_order,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_enabled: !r.is_enabled } : r)));
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startSaving(async () => {
      const result = await deletePackageRule(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium">Document package rules</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Which attachments get included in a HIC package, and when.
      </p>
      <div className="space-y-1.5">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between gap-2 rounded border border-black/10 px-2 py-1.5 text-sm dark:border-white/10">
            <span>
              <span className="font-medium">{rule.template_key}</span>{" "}
              <span className="text-black/50 dark:text-white/50">
                ({rule.financing_type_id ? financingTypeById.get(rule.financing_type_id)?.label ?? "—" : "all financing"} —{" "}
                {rule.condition_type === "always" ? "always" : `city in [${(rule.city_list ?? []).join(", ")}]`})
              </span>
              {!rule.is_enabled && <span className="ml-1 text-xs text-black/40 dark:text-white/40">(disabled)</span>}
            </span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => handleToggleEnabled(rule)} disabled={isSaving} className="text-xs underline disabled:opacity-50">
                {rule.is_enabled ? "Disable" : "Enable"}
              </button>
              <button type="button" onClick={() => handleDelete(rule.id)} disabled={isSaving} className="text-xs text-red-600 underline disabled:opacity-50 dark:text-red-400">
                Delete
              </button>
            </span>
          </div>
        ))}
        {rules.length === 0 && <p className="text-sm italic text-black/40 dark:text-white/40">No rules configured.</p>}
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-black/10 pt-3 dark:border-white/10">
        <Input value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} placeholder="template_key" className="w-44" />
        <Select value={newFinancingTypeId} onChange={(e) => setNewFinancingTypeId(e.target.value)}>
          <option value="">All financing types</option>
          {financingTypes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </Select>
        <Select value={conditionType} onChange={(e) => setConditionType(e.target.value as "always" | "city_in_list")}>
          <option value="always">Always</option>
          <option value="city_in_list">City in list</option>
        </Select>
        {conditionType === "city_in_list" && (
          <Input value={cityListText} onChange={(e) => setCityListText(e.target.value)} placeholder="henderson, boulder city" className="w-56" />
        )}
        <Button size="sm" variant="secondary" onClick={handleAdd} disabled={isSaving}>
          Add rule
        </Button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}

// ------------------------------------------------------------
function NotificationRecipientsCard({
  notificationRecipients,
  profiles,
}: {
  notificationRecipients: HicNotificationRecipient[];
  profiles: Profile[];
}) {
  const nameById = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);
  const [recipients, setRecipients] = useState(notificationRecipients);
  const [recipientType, setRecipientType] = useState<"user" | "email">("user");
  const [userId, setUserId] = useState(profiles[0]?.id ?? "");
  const [rawEmail, setRawEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleAdd() {
    setError(null);
    startSaving(async () => {
      const result = await addNotificationRecipient({
        recipientType,
        userId: recipientType === "user" ? userId : null,
        rawEmail: recipientType === "email" ? rawEmail : null,
        notifyOnSigned: true,
        notifyOnViewed: false,
        notifyOnDeclined: false,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRecipients((prev) => [...prev, result.recipient]);
      setRawEmail("");
    });
  }

  function handleToggleFlag(recipient: HicNotificationRecipient, flag: "notify_on_signed" | "notify_on_viewed" | "notify_on_declined") {
    setError(null);
    const next = { ...recipient, [flag]: !recipient[flag] };
    startSaving(async () => {
      const result = await updateNotificationRecipientFlags(
        recipient.id,
        next.notify_on_signed,
        next.notify_on_viewed,
        next.notify_on_declined
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRecipients((prev) => prev.map((r) => (r.id === recipient.id ? next : r)));
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startSaving(async () => {
      const result = await deleteNotificationRecipient(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRecipients((prev) => prev.filter((r) => r.id !== id));
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium">&quot;HIC Signed&quot; notification recipients</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Who gets emailed when a HIC is viewed, signed, or declined. The sending rep is always notified on top of this list.
      </p>
      <div className="space-y-1.5">
        {recipients.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-black/10 px-2 py-1.5 text-sm dark:border-white/10">
            <span>{r.recipient_type === "user" ? nameById.get(r.user_id ?? "") ?? "—" : r.raw_email}</span>
            <span className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={r.notify_on_signed} onChange={() => handleToggleFlag(r, "notify_on_signed")} disabled={isSaving} className="h-3.5 w-3.5" />
                Signed
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={r.notify_on_viewed} onChange={() => handleToggleFlag(r, "notify_on_viewed")} disabled={isSaving} className="h-3.5 w-3.5" />
                Viewed
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={r.notify_on_declined} onChange={() => handleToggleFlag(r, "notify_on_declined")} disabled={isSaving} className="h-3.5 w-3.5" />
                Declined
              </label>
              <button type="button" onClick={() => handleDelete(r.id)} disabled={isSaving} className="text-red-600 underline disabled:opacity-50 dark:text-red-400">
                Remove
              </button>
            </span>
          </div>
        ))}
        {recipients.length === 0 && <p className="text-sm italic text-black/40 dark:text-white/40">No extra recipients configured.</p>}
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-black/10 pt-3 dark:border-white/10">
        <Select value={recipientType} onChange={(e) => setRecipientType(e.target.value as "user" | "email")}>
          <option value="user">Teammate</option>
          <option value="email">Raw email</option>
        </Select>
        {recipientType === "user" ? (
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        ) : (
          <Input value={rawEmail} onChange={(e) => setRawEmail(e.target.value)} placeholder="name@example.com" className="w-56" />
        )}
        <Button size="sm" variant="secondary" onClick={handleAdd} disabled={isSaving}>
          Add recipient
        </Button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}

// ------------------------------------------------------------
function EmailTemplatesCard({ emailTemplates }: { emailTemplates: HicEmailTemplate[] }) {
  const [selectedId, setSelectedId] = useState(emailTemplates[0]?.id ?? "");
  const selected = emailTemplates.find((t) => t.id === selectedId) ?? emailTemplates[0] ?? null;

  const [subject, setSubject] = useState(selected?.subject ?? "");
  const [body, setBody] = useState(selected?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function handleSelect(id: string) {
    const template = emailTemplates.find((t) => t.id === id);
    setSelectedId(id);
    setSubject(template?.subject ?? "");
    setBody(template?.body ?? "");
    setSaved(false);
    setError(null);
  }

  function handleSave() {
    if (!selected) return;
    setError(null);
    setSaved(false);
    startSaving(async () => {
      const result = await saveEmailTemplate(selected.email_type, selected.language, subject, body);
      if (!result.ok) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium">Email templates</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Merge fields like {"{signer_name}"}, {"{rep_name}"}, {"{sign_link}"}, {"{download_link}"}, {"{customer_name}"} are
        replaced automatically — leave them exactly as written.
      </p>
      <Select value={selectedId} onChange={(e) => handleSelect(e.target.value)} className="block w-full">
        {emailTemplates.map((t) => (
          <option key={t.id} value={t.id}>
            {EMAIL_TYPE_LABEL[t.email_type]} — {t.language === "en" ? "English" : "Spanish"}
          </option>
        ))}
      </Select>
      {selected && (
        <>
          <div className="space-y-1">
            <label className="text-xs font-medium">Subject</label>
            <Input value={subject} onChange={(e) => { setSubject(e.target.value); setSaved(false); }} className="block w-full" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Body</label>
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); setSaved(false); }}
              rows={8}
              className="block w-full rounded-md border border-black/15 bg-transparent p-2 text-sm dark:border-white/20"
            />
          </div>
          <SaveRow isSaving={isSaving} saved={saved} error={error} onSave={handleSave} />
        </>
      )}
    </Card>
  );
}
