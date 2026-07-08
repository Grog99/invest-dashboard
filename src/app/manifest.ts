import type { MetadataRoute } from "next";

// Statyczny manifest (bez request-time API) — Next cache'uje go i serwuje
// pod /manifest.webmanifest, <link rel="manifest"> wstrzykuje się sam z
// samej obecności tego pliku. Ikony generowane programowo, patrz
// scripts/generate-pwa-icons.mjs (docs/plans/pwa-wersja-mobilna.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Invest Dashboard",
    short_name: "Invest",
    description: "Prywatny dashboard inwestycyjny",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    lang: "pl",
    dir: "ltr",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
