import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const COUNTER_FILE = process.env.VIEWS_FILE ?? path.join(process.cwd(), "views.json");

function readCount(): number {
  try {
    const raw = fs.readFileSync(COUNTER_FILE, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null && "count" in parsed) {
      const count = (parsed as { count: unknown }).count;
      if (typeof count === "number") return count;
    }
  } catch { /* file missing or corrupt */ }
  return 0;
}

function writeCount(count: number): void {
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count }), "utf-8");
}

export async function GET() {
  return NextResponse.json({ count: readCount() });
}

export async function POST() {
  const count = readCount() + 1;
  writeCount(count);
  return NextResponse.json({ count });
}
