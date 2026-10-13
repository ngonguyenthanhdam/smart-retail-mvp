function scaled(value: string, places: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value) || (value.split('.')[1]?.length ?? 0) > places) return BigInt(0);
  const [whole, fraction = ""] = value.split('.');
  return BigInt(whole) * BigInt(10) ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
}
export function cents(value: string): bigint { return scaled(value, 2); }
export function lineCents(quantity: string, unitPrice: string): bigint {
  return (scaled(quantity, 4) * cents(unitPrice) + BigInt(5000)) / BigInt(10000);
}
export function formatCents(value: bigint): string { return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`; }
