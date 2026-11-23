export const COUNTRY_CODES = [
  { code: "+91", label: "🇮🇳 (+91)" },
  { code: "+1", label: "🇺🇸/🇨🇦 (+1)" },
  { code: "+44", label: "🇬🇧 (+44)" },
  { code: "+971", label: "🇦🇪 (+971)" },
  { code: "+61", label: "🇦🇺 (+61)" },
  { code: "+65", label: "🇸🇬 (+65)" },
  { code: "+60", label: "🇲🇾 (+60)" },
] as const;

export function sanitizeDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}
