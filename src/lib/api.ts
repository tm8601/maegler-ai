export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "https://maegler.ai-beregner.dk";
  }

  return "";
}
