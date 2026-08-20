"use client";

import { useEffect, useState } from "react";

// Classic "animate on mount" pattern: a panel/modal starts in its
// off-screen/scaled-down state on first render, then this flips to true
// right after that initial paint commits, so the browser actually
// transitions the change instead of snapping straight to the final
// position. Every slide-in/pop-in panel in the app (LeadDetailPanel,
// RouteResultPanel, AppointmentDetailPanel, the Add/Set modals, etc.)
// shares this one hook rather than each re-deriving the same
// useState+useEffect pair.
export function useSlideIn(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // rAF (not a direct setState call) guarantees the browser has
    // actually painted the initial "hidden" position at least once
    // before flipping — calling setState synchronously in the effect
    // body risks the flip landing in the same paint as the first render
    // in some cases, which would skip the transition entirely.
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return visible;
}
