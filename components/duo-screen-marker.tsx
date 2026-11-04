"use client";

import { useEffect, useState } from "react";
import { useDuoScreen } from "@/lib/use-duo-screen";

// Turns on the html[data-duo-screen] styles in app/globals.css.
export function DuoScreenMarker() {
  const isDuo = useDuoScreen();

  useEffect(() => {
    document.documentElement.toggleAttribute("data-duo-screen", isDuo);
  }, [isDuo]);

  return <DuoScreenReadout isDuo={isDuo} />;
}

// TEMPORARY: remove once the Duo fix is confirmed on a real phone. Shows only
// with ?duocheck=1 in the address.
function DuoScreenReadout({ isDuo }: { isDuo: boolean }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!window.location.search.includes("duocheck=1")) return;
    const update = () =>
      setText(
        [
          `Duo layout: ${isDuo ? "ON" : "OFF"}`,
          `Page ${window.innerWidth} x ${window.innerHeight}`,
          `Screen ${screen.width} x ${screen.height} at ${window.devicePixelRatio}x`,
          `Coarse pointer: ${window.matchMedia("(pointer: coarse)").matches}`,
          `Landscape: ${window.matchMedia("(orientation: landscape)").matches}`,
          `Build: ${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"}`,
        ].join("\n")
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isDuo]);

  if (!text) return null;
  return (
    <pre className="fixed left-2 top-2 z-[200] rounded bg-black/85 p-2 text-xs text-white">{text}</pre>
  );
}
