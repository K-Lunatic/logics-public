import { NextResponse } from "next/server";
import {
  authenticateAutomationRequest,
  dbRemote,
} from "@ink/assembler/server";

interface EnvironmentReadingInput {
  deviceName: string;
  room: string;
  temperature?: number;
  humidity?: number;
  recordedAt?: string;
}

function parseEnvironmentReading(input: unknown): EnvironmentReadingInput | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const deviceName = typeof value.deviceName === "string" ? value.deviceName.trim() : "";
  const room = typeof value.room === "string" ? value.room.trim() : "";
  const temperature = value.temperature;
  const humidity = value.humidity;
  const recordedAt = value.recordedAt;
  if (
    !deviceName || deviceName.length > 100 ||
    !room || room.length > 100 ||
    (temperature !== undefined && (typeof temperature !== "number" || temperature < -50 || temperature > 100)) ||
    (humidity !== undefined && (typeof humidity !== "number" || humidity < 0 || humidity > 100)) ||
    (temperature === undefined && humidity === undefined) ||
    (recordedAt !== undefined && (typeof recordedAt !== "string" || Number.isNaN(Date.parse(recordedAt))))
  ) return null;
  return {
    deviceName,
    room,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(humidity !== undefined ? { humidity } : {}),
    ...(typeof recordedAt === "string" ? { recordedAt } : {}),
  };
}

const unauthorized = () =>
  NextResponse.json({ error: "유효한 사용자 ID와 자동화 키가 필요합니다." }, { status: 401 });

export async function GET(request: Request) {
  const userId = await authenticateAutomationRequest(request);
  if (!userId) return unauthorized();
  const data = await dbRemote.get(
    `users/${userId}/environment_readings/latest`,
  );
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const userId = await authenticateAutomationRequest(request);
  if (!userId) return unauthorized();

  const raw = await request.text();
  if (raw.length > 16_384) {
    return NextResponse.json({ error: "요청 본문은 16KB 이하여야 합니다." }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "올바른 JSON이 아닙니다." }, { status: 400 });
  }
  const parsed = parseEnvironmentReading(input);
  if (!parsed) {
    return NextResponse.json(
      { error: "기기·방 이름과 정상 범위의 온도 또는 습도가 필요합니다." },
      { status: 400 },
    );
  }

  const receivedAt = new Date().toISOString();
  const reading = {
    id: `reading_${crypto.randomUUID()}`,
    ...parsed,
    recordedAt: parsed.recordedAt || receivedAt,
    receivedAt,
  };
  await dbRemote.batchSet([
    {
      path: `users/${userId}/environment_readings/${reading.id}`,
      data: reading,
    },
    {
      path: `users/${userId}/environment_readings/latest`,
      data: reading,
    },
  ]);
  return NextResponse.json({ data: reading }, { status: 201 });
}
