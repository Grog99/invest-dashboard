import { NextRequest, NextResponse } from "next/server";
import {
  getSetting,
  setSetting,
  SETTING_KEYS,
  DEFAULT_MODEL,
} from "@/lib/settings";

export async function GET() {
  const apiKey = getSetting(SETTING_KEYS.openrouterApiKey);
  return NextResponse.json({
    model: getSetting(SETTING_KEYS.openrouterModel) || DEFAULT_MODEL,
    hasApiKey: !!apiKey,
    apiKeyPreview: apiKey ? `${apiKey.slice(0, 8)}…${apiKey.slice(-4)}` : null,
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
  return NextResponse.json({ ok: true });
}
