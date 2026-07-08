import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import cron from "node-cron";
import {
  getSetting,
  setSetting,
  getTheme,
  SETTING_KEYS,
  DEFAULT_MODEL,
  DEFAULT_CRON,
} from "@/lib/settings";
import { reloadScheduler } from "@/lib/scheduler";

export async function GET() {
  const apiKey = getSetting(SETTING_KEYS.openrouterApiKey);
  return NextResponse.json({
    model: getSetting(SETTING_KEYS.openrouterModel) || DEFAULT_MODEL,
    hasApiKey: !!apiKey,
    apiKeyPreview: apiKey ? `${apiKey.slice(0, 8)}…${apiKey.slice(-4)}` : null,
    cronQuotes: getSetting(SETTING_KEYS.cronQuotes) ?? DEFAULT_CRON.quotes,
    cronNews: getSetting(SETTING_KEYS.cronNews) ?? DEFAULT_CRON.news,
    theme: getTheme(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.apiKey === "string") {
    setSetting(SETTING_KEYS.openrouterApiKey, body.apiKey.trim());
  }
  if (typeof body.model === "string" && body.model.trim()) {
    setSetting(SETTING_KEYS.openrouterModel, body.model.trim());
  }

  // Cron notowań/newsów: pusty string = wyłączone, niepusty musi przejść
  // walidację node-cron — inaczej 400 i nic nie zapisujemy.
  for (const field of ["cronQuotes", "cronNews"] as const) {
    const raw = body[field];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed && !cron.validate(trimmed)) {
      return NextResponse.json(
        { error: `Niepoprawne wyrażenie cron: "${trimmed}"` },
        { status: 400 }
      );
    }
  }
  if (typeof body.cronQuotes === "string") {
    setSetting(SETTING_KEYS.cronQuotes, body.cronQuotes.trim());
  }
  if (typeof body.cronNews === "string") {
    setSetting(SETTING_KEYS.cronNews, body.cronNews.trim());
  }

  if (body.theme === "dark" || body.theme === "light") {
    setSetting(SETTING_KEYS.theme, body.theme);
    (await cookies()).set("theme", body.theme, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
      httpOnly: true,
    });
  }

  // "" czyści wybór ("Brak"); wartość musi być dodatnią liczbą całkowitą,
  // inaczej ignorujemy (spółka mogła zniknąć — page.tsx i tak weryfikuje id
  // przy odczycie).
  if (typeof body.benchmarkCompanyId === "string") {
    const trimmed = body.benchmarkCompanyId.trim();
    if (trimmed === "") {
      setSetting(SETTING_KEYS.dashboardBenchmark, "");
    } else {
      const id = Number(trimmed);
      if (Number.isInteger(id) && id > 0) {
        setSetting(SETTING_KEYS.dashboardBenchmark, trimmed);
      }
    }
  }

  // reloadScheduler() jest kosztowny (przeładowuje harmonogram crona) —
  // wołamy go tylko, gdy w body faktycznie są pola cron, żeby np. samo
  // przełączenie motywu nie przeładowywało harmonogramu.
  if (
    typeof body.cronQuotes === "string" ||
    typeof body.cronNews === "string"
  ) {
    reloadScheduler();
  }

  return NextResponse.json({ ok: true });
}
