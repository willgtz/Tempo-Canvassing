"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string;
};

// Thin wrapper around react-signature-canvas — chosen over hand-rolling
// pointer-event capture for better out-of-the-box touch/stylus drawing
// quality on phones and iPads, where most signers will actually be
// using this.
export const SignaturePad = forwardRef<SignaturePadHandle, { label: string; height?: number }>(
  function SignaturePad({ label, height = 150 }, ref) {
    const padRef = useRef<SignatureCanvas>(null);

    useImperativeHandle(ref, () => ({
      clear: () => padRef.current?.clear(),
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataUrl: () => padRef.current?.getCanvas().toDataURL("image/png") ?? "",
    }));

    return (
      <div className="space-y-1">
        <div className="rounded-md border border-black/15 bg-white dark:border-white/20 dark:bg-white">
          <SignatureCanvas
            ref={padRef}
            penColor="#111827"
            canvasProps={{ className: "w-full touch-none", style: { height } }}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
          <button
            type="button"
            onClick={() => padRef.current?.clear()}
            className="text-xs text-black/50 underline hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Clear
          </button>
        </div>
      </div>
    );
  }
);
