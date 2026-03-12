const COMMON_LOCATIONS = [
  "New York, NY, United States",
  "Los Angeles, CA, United States",
  "San Francisco, CA, United States",
  "Seattle, WA, United States",
  "Chicago, IL, United States",
  "Dallas, TX, United States",
  "Miami, FL, United States",
  "Honolulu, HI, United States",
  "Toronto, Ontario, Canada",
  "Vancouver, British Columbia, Canada",
  "Mexico City, Mexico",
  "Cancun, Mexico",
  "London, United Kingdom",
  "Paris, France",
  "Rome, Italy",
  "Barcelona, Spain",
  "Lisbon, Portugal",
  "Amsterdam, Netherlands",
  "Dublin, Ireland",
  "Edinburgh, United Kingdom",
  "Reykjavik, Iceland",
  "Tokyo, Japan",
  "Kyoto, Japan",
  "Osaka, Japan",
  "Seoul, South Korea",
  "Busan, South Korea",
  "Singapore",
  "Bangkok, Thailand",
  "Phuket, Thailand",
  "Kuala Lumpur, Malaysia",
  "Bali, Indonesia",
  "Jakarta, Indonesia",
  "Manila, Philippines",
  "Hong Kong",
  "Taipei, Taiwan",
  "Sydney, Australia",
  "Melbourne, Australia",
  "Auckland, New Zealand",
  "Queenstown, New Zealand",
  "Dubai, United Arab Emirates",
  "Abu Dhabi, United Arab Emirates",
  "Istanbul, Turkey",
  "Athens, Greece",
  "Cairo, Egypt",
  "Cape Town, South Africa",
  "Marrakesh, Morocco",
  "Rio de Janeiro, Brazil",
  "Sao Paulo, Brazil",
  "Buenos Aires, Argentina",
  "Lima, Peru",
];

function normalizeLocation(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildLocationOptions(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const value of [...values, ...COMMON_LOCATIONS]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const normalized = normalizeLocation(trimmed);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    options.push(trimmed);
  }

  return options;
}

export function filterLocationOptions(options: string[], query: string, limit = 12) {
  const normalizedQuery = normalizeLocation(query);
  if (!normalizedQuery) {
    return options.slice(0, limit);
  }

  return options
    .filter((option) => normalizeLocation(option).includes(normalizedQuery))
    .slice(0, limit);
}
