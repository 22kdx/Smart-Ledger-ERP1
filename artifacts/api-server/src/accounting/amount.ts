const SCALE = 10_000n;
const AMOUNT_PATTERN = /^(0|[1-9][0-9]{0,15})(?:\.([0-9]{1,4}))?$/;

export function parseAmount(value: string): bigint | null {
  const match = AMOUNT_PATTERN.exec(value);
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(4, "0");
  return BigInt(match[1]) * SCALE + BigInt(fraction || "0");
}

export function formatAmount(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(4, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function isAmountBalanced(
  lines: Array<{ side: "debit" | "credit"; amount: string }>,
): boolean {
  let debits = 0n;
  let credits = 0n;
  for (const line of lines) {
    const amount = parseAmount(line.amount);
    if (amount === null || amount <= 0n) return false;
    if (line.side === "debit") debits += amount;
    else credits += amount;
  }
  return debits === credits;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
