export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function money(n: number, digits = 2) {
  const abs = Math.abs(n).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return (n < 0 ? "−" : "") + abs;
}

export function signedMoney(n: number) {
  const abs = Math.abs(n).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (n > 0.004) return `+${abs}`;
  if (n < -0.004) return `−${abs}`;
  return abs;
}

export function signedPct(ratio: number) {
  const v = Math.abs(ratio * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (ratio > 0.00005) return `+${v} %`;
  if (ratio < -0.00005) return `−${v} %`;
  return `${v} %`;
}

export function px(n: number, digits: number) {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function qty(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: n >= 100 ? 2 : 3 });
}

export function clock(t: number) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(t);
}

export function pnlClass(n: number) {
  if (n > 0.004) return "text-jade";
  if (n < -0.004) return "text-rose";
  return "text-muted";
}
