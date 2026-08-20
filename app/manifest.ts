import type { MetadataRoute } from "next";

// Next.js's app/manifest.ts file convention — auto-generates and links
// /manifest.webmanifest, which is what lets "Add to Home Screen" install
// this as a standalone app (no Safari chrome, its own launch icon) rather
// than just bookmarking a browser tab. display: "standalone" is the part
// that actually matters for that; everything else here is metadata.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fenix",
    short_name: "Fenix",
    description: "Fenix Canvassing — lead, appointment, and route management.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
