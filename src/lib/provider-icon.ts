const PROVIDER_ICON: Record<string, string> = {
  kms: "🏢",
  gdrive: "📁",
  dropbox: "📦",
  web: "🔗",
};

export function providerIcon(provider?: string | null) {
  return PROVIDER_ICON[provider ?? "web"] ?? "🔗";
}
