"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PdfPageCanvas } from "@/components/slideshow/pdf-page-canvas";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
import { t } from "@/lib/hic/i18n";
import { cn } from "@/components/ui/cn";

// All current templates are standard US Letter (confirmed against the
// real uploaded PDFs) — used to convert each field's fixed PDF-point
// position into on-screen pixels against whatever size PdfPageCanvas
// actually rendered that page at.
const PAGE_WIDTH_PT = 612;
const PAGE_HEIGHT_PT = 792;

type SignerField = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fieldKey: string;
  fieldType: "signature" | "initials" | "date";
  required: boolean;
};

type SigningData = {
  hic: { customerName: string; hasCoBorrower: boolean; language: "en" | "es" };
  signer: { id: string; role: "homeowner" | "co_borrower"; fullName: string; status: string };
  documentUrl: string;
  pageCount: number;
  fields: SignerField[];
};

type Phase = "loading" | "error" | "already-signed" | "consent" | "adopt" | "sign" | "complete" | "declined";

function deriveInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SigningClient({ signerId, token }: { signerId: string; token: string | null }) {
  // Lazy initializers (not an effect) for the missing-token case — it's
  // derivable synchronously from the token prop at first render, so
  // there's nothing to "do in response to" that an effect would be for.
  const [phase, setPhase] = useState<Phase>(() => (token ? "loading" : "error"));
  const [data, setData] = useState<SigningData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(() =>
    token ? null : "This link is missing its security token."
  );

  const [consentChecked, setConsentChecked] = useState(false);

  const [signatureMethod, setSignatureMethod] = useState<"typed" | "drawn">("typed");
  const [typedSignature, setTypedSignature] = useState("");
  const [typedInitials, setTypedInitials] = useState("");
  const signaturePadRef = useRef<SignaturePadHandle>(null);
  const initialsPadRef = useRef<SignaturePadHandle>(null);

  const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(new Set());
  const [pageSizes, setPageSizes] = useState<Record<number, { width: number; height: number }>>({});

  // Drives the auto-advance-after-confirming behavior below — set the
  // instant a field is confirmed, cleared once the resulting scroll has
  // fired. Kept separate from confirmedKeys itself so the scroll only
  // triggers on a fresh confirmation, never as a side effect of anything
  // else touching confirmedKeys.
  const [justConfirmedKey, setJustConfirmedKey] = useState<string | null>(null);
  const fieldRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hasAutoScrolledToFirst = useRef(false);

  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isDeclining, setIsDeclining] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token) return; // phase/loadError already set correctly above
    let cancelled = false;
    fetch(`/api/public/hic/${signerId}?t=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load document.");
        return body as SigningData;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setTypedSignature(body.signer.fullName);
        setTypedInitials(deriveInitials(body.signer.fullName));
        if (body.signer.status === "signed") setPhase("already-signed");
        else setPhase("consent");
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load document.");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [signerId, token]);

  const language = data?.hic.language ?? "en";
  const needsInitials = useMemo(() => data?.fields.some((f) => f.fieldType === "initials") ?? false, [data]);

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, SignerField[]>();
    for (const field of data?.fields ?? []) {
      if (!map.has(field.page)) map.set(field.page, []);
      map.get(field.page)!.push(field);
    }
    return map;
  }, [data]);

  const requiredFields = useMemo(() => (data?.fields ?? []).filter((f) => f.required), [data]);
  // Date fields need no interaction — treated as implicitly satisfied
  // here rather than tracked in confirmedKeys at all, so the rep/
  // customer only ever clicks the signature/initials placeholders that
  // actually represent a decision (date overlays are never rendered as
  // clickable in the first place, see the .filter below).
  const allRequiredConfirmed = requiredFields.every((f) => f.fieldType === "date" || confirmedKeys.has(f.fieldKey));

  // Document reading order: page ascending, then top-to-bottom within a
  // page — PDF y increases upward from the bottom, so "higher on the
  // page" is DESCENDING y, not ascending. Drives both the Next button and
  // the auto-advance-after-confirming behavior below, so a signer who
  // only taps fields as they're highlighted still lands on every one of
  // them in a sane order, never skipping around the document.
  const clickableFieldsInOrder = useMemo(
    () =>
      (data?.fields ?? [])
        .filter((f) => f.fieldType !== "date")
        .slice()
        .sort((a, b) => a.page - b.page || b.y - a.y),
    [data]
  );
  const hasRemainingFields = clickableFieldsInOrder.some((f) => !confirmedKeys.has(f.fieldKey));

  const findNextUnfilled = useCallback(
    (afterKey: string | null): SignerField | null => {
      const list = clickableFieldsInOrder;
      const afterIndex = afterKey ? list.findIndex((f) => f.fieldKey === afterKey) : -1;
      for (let i = afterIndex + 1; i < list.length; i++) {
        if (!confirmedKeys.has(list[i].fieldKey)) return list[i];
      }
      // Wrap around in case something earlier in the doc is still
      // unconfirmed (shouldn't normally happen given the linear flow,
      // but Next/auto-advance should never dead-end if it does).
      for (let i = 0; i <= afterIndex && i < list.length; i++) {
        if (!confirmedKeys.has(list[i].fieldKey)) return list[i];
      }
      return null;
    },
    [clickableFieldsInOrder, confirmedKeys]
  );

  const scrollToField = useCallback((key: string) => {
    fieldRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  function handleNextField() {
    const next = findNextUnfilled(null);
    if (next) scrollToField(next.fieldKey);
  }

  function handleFieldClick(field: SignerField) {
    if (field.fieldType === "date" || confirmedKeys.has(field.fieldKey)) return;
    setConfirmedKeys((prev) => new Set(prev).add(field.fieldKey));
    setJustConfirmedKey(field.fieldKey);
  }

  // Auto-advance: a beat after confirming a field, jump to the next
  // unfilled one so a signer who just taps each highlighted box as it
  // appears is carried straight through the document. The short delay
  // lets the "confirmed" state actually paint first, so the jump doesn't
  // happen before they've seen their own signature/initials land.
  useEffect(() => {
    if (!justConfirmedKey) return;
    const timer = setTimeout(() => {
      const next = findNextUnfilled(justConfirmedKey);
      if (next) scrollToField(next.fieldKey);
      setJustConfirmedKey(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [justConfirmedKey, findNextUnfilled, scrollToField]);

  // Jump to the very first field the moment the sign phase begins, once
  // per entry into that phase (the ref guard, not a dependency check,
  // is what prevents this from re-firing on every later confirm).
  useEffect(() => {
    if (phase !== "sign") {
      hasAutoScrolledToFirst.current = false;
      return;
    }
    if (hasAutoScrolledToFirst.current) return;
    hasAutoScrolledToFirst.current = true;
    const timer = setTimeout(() => {
      const first = findNextUnfilled(null);
      if (first) scrollToField(first.fieldKey);
    }, 300);
    return () => clearTimeout(timer);
  }, [phase, findNextUnfilled, scrollToField]);

  function handleAdoptContinue() {
    if (signatureMethod === "typed") {
      if (!typedSignature.trim()) return;
      if (needsInitials && !typedInitials.trim()) return;
    } else {
      if (signaturePadRef.current?.isEmpty()) return;
      if (needsInitials && initialsPadRef.current?.isEmpty()) return;
    }
    setPhase("sign");
  }

  async function handleFinishSign() {
    if (!data || !token) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/public/hic/${signerId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          consent: true,
          signatureType: signatureMethod,
          signatureText: signatureMethod === "typed" ? typedSignature.trim() : undefined,
          signatureImageDataUrl: signatureMethod === "drawn" ? signaturePadRef.current?.toDataUrl() : undefined,
          initialsText: signatureMethod === "typed" ? typedInitials.trim() : undefined,
          initialsImageDataUrl: signatureMethod === "drawn" ? initialsPadRef.current?.toDataUrl() : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to sign.");
      setCompleted(Boolean(body.completed));
      setPhase("complete");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to sign.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDecline() {
    if (!token) return;
    setIsDeclining(true);
    try {
      const res = await fetch(`/api/public/hic/${signerId}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: declineReason.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to decline.");
      setPhase("declined");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to decline.");
    } finally {
      setIsDeclining(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-black/50 dark:text-white/50">{t("en", "loading")}</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold">{t("en", "errorTitle")}</p>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">{loadError}</p>
        </div>
      </div>
    );
  }

  if (phase === "already-signed" || phase === "complete") {
    const title = phase === "already-signed" || completed ? t(language, "completeTitleFull") : t(language, "completeTitlePartial");
    const body = phase === "already-signed" || completed ? t(language, "completeBodyFull") : t(language, "completeBodyPartial");
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">
            ✓
          </div>
          <p className="text-lg font-semibold">{title}</p>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">{body}</p>
        </div>
      </div>
    );
  }

  if (phase === "declined") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold">{t(language, "declinedTitle")}</p>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">{t(language, "declinedBody")}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    // h-full (this fills the page-level h-dvh/overflow-hidden wrapper) +
    // overflow-hidden here too — without both, the stacked PDF pages
    // below can grow taller than the viewport and the WHOLE PAGE scrolls
    // instead of just the document pane, which is exactly what was
    // carrying the header and the action bar below off-screen as you
    // scrolled. Only the middle pane (flex-1 + min-h-0 + overflow-y-auto)
    // is meant to scroll — header and footer now stay genuinely pinned.
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-black/10 p-4 dark:border-white/10">
        <p className="text-sm font-semibold">
          {phase === "consent" && t(language, "reviewDocument")}
          {phase === "adopt" && t(language, "adoptTitle")}
          {phase === "sign" && t(language, "signTitle")}
        </p>
        {phase === "sign" && <p className="mt-1 text-xs text-black/50 dark:text-white/50">{t(language, "signSubtitle")}</p>}
      </div>

      {(phase === "consent" || phase === "sign") && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {Array.from({ length: data.pageCount }, (_, i) => i + 1).map((page) => {
            const size = pageSizes[page];
            const scale = size ? size.width / PAGE_WIDTH_PT : null;
            return (
              <div key={page} className="relative rounded border border-black/10 dark:border-white/10">
                <PdfPageCanvas
                  fileUrl={data.documentUrl}
                  page={page}
                  onLoaded={(renderedSize) => setPageSizes((prev) => ({ ...prev, [page]: renderedSize }))}
                />
                {phase === "sign" &&
                  scale &&
                  (fieldsByPage.get(page) ?? [])
                    .filter((f) => f.fieldType !== "date")
                    .map((field) => {
                      const confirmed = confirmedKeys.has(field.fieldKey);
                      const left = field.x * scale;
                      const topPx = (PAGE_HEIGHT_PT - (field.y + field.height)) * scale;
                      const widthPx = Math.max(field.width * scale, 60);
                      const heightPx = Math.max(field.height * scale, 20);
                      return (
                        <button
                          key={field.fieldKey}
                          ref={(el) => {
                            if (el) fieldRefs.current.set(field.fieldKey, el);
                            else fieldRefs.current.delete(field.fieldKey);
                          }}
                          type="button"
                          onClick={() => handleFieldClick(field)}
                          disabled={confirmed}
                          style={{ position: "absolute", left, top: topPx, width: widthPx, height: heightPx }}
                          className={cn(
                            "flex items-center justify-center rounded text-[10px] font-medium",
                            confirmed
                              ? field.fieldType === "signature"
                                ? "font-['cursive'] text-base text-blue-700"
                                : "text-blue-700"
                              : "animate-pulse border-2 border-dashed border-blue-500 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20"
                          )}
                        >
                          {confirmed
                            ? signatureMethod === "typed"
                              ? field.fieldType === "signature"
                                ? typedSignature
                                : typedInitials
                              : "✓"
                            : field.fieldType === "signature"
                              ? t(language, "clickToSign")
                              : t(language, "clickToInitial")}
                        </button>
                      );
                    })}
              </div>
            );
          })}
        </div>
      )}

      <div className="shrink-0 border-t border-black/10 p-4 dark:border-white/10">
        {submitError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{submitError}</p>}

        {phase === "consent" && !showDeclineForm && (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              {t(language, "consentLabel")}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeclineForm(true)}
                className="flex-1 rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                {t(language, "declineLink")}
              </button>
              <button
                type="button"
                disabled={!consentChecked}
                onClick={() => setPhase("adopt")}
                className="flex-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-blue-500"
              >
                {t(language, "continueButton")}
              </button>
            </div>
          </div>
        )}

        {phase === "consent" && showDeclineForm && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t(language, "declineTitle")}</p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder={t(language, "declineReasonLabel")}
              rows={3}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeclineForm(false)}
                className="flex-1 rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                {t(language, "declineCancel")}
              </button>
              <button
                type="button"
                disabled={isDeclining}
                onClick={handleDecline}
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t(language, "declineConfirm")}
              </button>
            </div>
          </div>
        )}

        {phase === "adopt" && (
          <div className="space-y-4">
            <p className="text-xs text-black/60 dark:text-white/60">{t(language, "adoptSubtitle")}</p>
            <div className="flex overflow-hidden rounded-full border border-black/15 dark:border-white/20">
              <button
                type="button"
                onClick={() => setSignatureMethod("typed")}
                className={cn(
                  "flex-1 px-3 py-1.5 text-sm font-medium",
                  signatureMethod === "typed" ? "bg-blue-600 text-white dark:bg-blue-500" : ""
                )}
              >
                {t(language, "methodTyped")}
              </button>
              <button
                type="button"
                onClick={() => setSignatureMethod("drawn")}
                className={cn(
                  "flex-1 px-3 py-1.5 text-sm font-medium",
                  signatureMethod === "drawn" ? "bg-blue-600 text-white dark:bg-blue-500" : ""
                )}
              >
                {t(language, "methodDrawn")}
              </button>
            </div>

            {signatureMethod === "typed" ? (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium">{t(language, "signatureLabel")}</label>
                  <input
                    value={typedSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                    className="w-full rounded border border-black/15 px-2 py-2 font-['cursive'] text-xl dark:border-white/20 dark:bg-transparent"
                  />
                </div>
                {needsInitials && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t(language, "initialsLabel")}</label>
                    <input
                      value={typedInitials}
                      onChange={(e) => setTypedInitials(e.target.value)}
                      className="w-32 rounded border border-black/15 px-2 py-2 font-['cursive'] text-xl dark:border-white/20 dark:bg-transparent"
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <SignaturePad ref={signaturePadRef} label={t(language, "signatureLabel")} />
                {needsInitials && <SignaturePad ref={initialsPadRef} label={t(language, "initialsLabel")} height={100} />}
              </>
            )}

            <button
              type="button"
              onClick={handleAdoptContinue}
              className="w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white dark:bg-blue-500"
            >
              {t(language, "continueToDocument")}
            </button>
          </div>
        )}

        {phase === "sign" && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!hasRemainingFields}
              onClick={handleNextField}
              className="flex-1 rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
            >
              {hasRemainingFields ? t(language, "nextField") : t(language, "allFieldsDone")}
            </button>
            <button
              type="button"
              disabled={!allRequiredConfirmed || isSubmitting}
              onClick={handleFinishSign}
              className="flex-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-blue-500"
            >
              {isSubmitting ? t(language, "signing") : t(language, "finishAndSign")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
