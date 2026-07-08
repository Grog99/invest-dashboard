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
    // Dopasowane do domyślnego motywu „Dzień" (Rocznik, --color-bg jasny).
    // Ekran powitalny PWA nie zna wyboru motywu użytkownika (statyczny
    // manifest), więc idzie za DEFAULT_THEME z lib/settings.ts.
    background_color: "#f4ecdd",
    theme_color: "#f4ecdd",
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
