import { createHash } from "crypto";

export { redact } from "@/lib/redact";

export function hashForLog(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
