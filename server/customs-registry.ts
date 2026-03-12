type CustomsRegistryEntry = {
  countryCode: string;
  countryName: string;
  officialName: string;
  officialUrl: string;
  sourceDomain: string;
  sourceLabel: string;
  deadline: string;
  officialSummaryFacts: string[];
  aliases: string[];
};

export type ResolvedCustomsEntry = CustomsRegistryEntry & {
  matchedAlias: string;
};

const US_STATE_ABBREVIATIONS = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks",
  "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny",
  "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
  "wi", "wy", "dc",
]);

const customsRegistry: CustomsRegistryEntry[] = [
  {
    countryCode: "US",
    countryName: "United States",
    officialName: "Mobile Passport Control (eligible travelers)",
    officialUrl: "https://www.cbp.gov/travel/us-citizens/mobile-passport-control",
    sourceDomain: "cbp.gov",
    sourceLabel: "U.S. Customs and Border Protection",
    deadline: "Use it before or upon arrival at a supported U.S. airport or preclearance location if you are eligible.",
    officialSummaryFacts: [
      "Mobile Passport Control is an official CBP option for eligible travelers returning to the United States through supported locations.",
      "Travelers should confirm airport support, eligibility, and current instructions on the official CBP page before travel.",
      "If MPC does not apply, travelers should follow the normal CBP inspection and arrival process.",
    ],
    aliases: ["united states", "usa", "us", "u.s.", "america", "dallas", "new york", "los angeles", "san francisco", "honolulu", "chicago", "miami", "seattle", "atlanta", "san antonio", "houston", "austin", "las vegas", "orlando", "boston"],
  },
  {
    countryCode: "JP",
    countryName: "Japan",
    officialName: "Visit Japan Web",
    officialUrl: "https://vjw-lp.digital.go.jp/en/",
    sourceDomain: "vjw-lp.digital.go.jp",
    sourceLabel: "Digital Agency of Japan / Visit Japan Web",
    deadline: "Complete it before arrival in Japan.",
    officialSummaryFacts: [
      "Visit Japan Web supports immigration and customs declaration steps for eligible travelers.",
      "Travelers should prepare passport details, flight details, accommodation details, and any customs declaration information before starting.",
      "Travelers should confirm the latest eligibility and declaration steps on the official site before departure.",
    ],
    aliases: ["japan", "tokyo", "osaka", "kyoto", "sapporo", "fukuoka", "okinawa", "narita", "haneda"],
  },
  {
    countryCode: "SG",
    countryName: "Singapore",
    officialName: "SG Arrival Card",
    officialUrl: "https://eservices.ica.gov.sg/sgarrivalcard/",
    sourceDomain: "ica.gov.sg",
    sourceLabel: "Immigration & Checkpoints Authority of Singapore",
    deadline: "Submit within 3 days before arrival in Singapore.",
    officialSummaryFacts: [
      "The SG Arrival Card is free on the official ICA service.",
      "Travelers should prepare passport details, travel details, accommodation details, and health declaration information if requested.",
      "ICA warns travelers to avoid fake or misleading SG Arrival Card websites.",
    ],
    aliases: ["singapore", "changi"],
  },
  {
    countryCode: "TH",
    countryName: "Thailand",
    officialName: "Thailand Digital Arrival Card",
    officialUrl: "https://tdac.immigration.go.th/arrival-card/#/home",
    sourceDomain: "tdac.immigration.go.th",
    sourceLabel: "Thailand Immigration Bureau",
    deadline: "Complete it within the official submission window before arriving in Thailand.",
    officialSummaryFacts: [
      "Travelers should prepare passport details, trip details, local stay address, and onward or departure details if requested.",
      "The official TDAC site should be used instead of third-party submission sites.",
      "Travelers should confirm exemptions and current submission timing on the official immigration site before travel.",
    ],
    aliases: ["thailand", "bangkok", "phuket", "chiang mai", "krabi", "pattaya", "koh samui"],
  },
  {
    countryCode: "MY",
    countryName: "Malaysia",
    officialName: "Malaysia Digital Arrival Card (MDAC)",
    officialUrl: "https://imigresen-online.imi.gov.my/mdac/main/main",
    sourceDomain: "imigresen-online.imi.gov.my",
    sourceLabel: "Immigration Department of Malaysia",
    deadline: "Complete it within 3 days before arrival in Malaysia.",
    officialSummaryFacts: [
      "MDAC is for foreign visitors who are required to submit Malaysia's digital arrival card.",
      "Travelers should prepare passport details, travel details, and local address details before starting.",
      "Travelers should verify whether they are exempt on the official Malaysian immigration pages before departure.",
    ],
    aliases: ["malaysia", "kuala lumpur", "penang", "langkawi", "johor bahru", "kota kinabalu"],
  },
  {
    countryCode: "KR",
    countryName: "South Korea",
    officialName: "Korea e-Arrival Card",
    officialUrl: "https://www.e-arrivalcard.go.kr/portal/main/index.do",
    sourceDomain: "e-arrivalcard.go.kr",
    sourceLabel: "Korean e-Government / Ministry of Justice",
    deadline: "Submit within 3 days before arrival in Korea.",
    officialSummaryFacts: [
      "The official Korea e-Arrival Card site states there is no fee.",
      "Travelers should prepare passport details, arrival and departure information, address of stay, and contact details.",
      "Travelers with valid K-ETA approval or other exemptions should confirm whether they still need to submit the form on the official site.",
    ],
    aliases: ["south korea", "korea", "seoul", "busan", "incheon", "jeju"],
  },
  {
    countryCode: "NZ",
    countryName: "New Zealand",
    officialName: "New Zealand Traveller Declaration",
    officialUrl: "https://www.travellerdeclaration.govt.nz/",
    sourceDomain: "travellerdeclaration.govt.nz",
    sourceLabel: "New Zealand Traveller Declaration",
    deadline: "Complete it before your journey to New Zealand and before arrival processing.",
    officialSummaryFacts: [
      "The New Zealand Traveller Declaration can be completed online or through the official app.",
      "Travelers should prepare passport details, flight or voyage details, and declaration information about goods and biosecurity items.",
      "Transit passengers may have different requirements and should confirm them on the official New Zealand Traveller Declaration site.",
    ],
    aliases: ["new zealand", "auckland", "wellington", "queenstown", "christchurch"],
  },
];

function normalizeLookupValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .replace(/\s*,\s*/g, ", ");
}

function inferUnitedStatesLocation(normalizedDestination: string) {
  if (
    normalizedDestination.includes("united states") ||
    normalizedDestination.includes(", usa") ||
    normalizedDestination.includes(", us") ||
    normalizedDestination.endsWith(", usa") ||
    normalizedDestination.endsWith(", us")
  ) {
    return true;
  }

  const parts = normalizedDestination.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const trailingPart = parts[parts.length - 1];
    if (US_STATE_ABBREVIATIONS.has(trailingPart)) {
      return true;
    }
  }

  return false;
}

export function resolveCustomsEntry(destination: string): ResolvedCustomsEntry | null {
  const normalizedDestination = normalizeLookupValue(destination);
  if (!normalizedDestination) {
    return null;
  }

  if (inferUnitedStatesLocation(normalizedDestination)) {
    const usEntry = customsRegistry.find((entry) => entry.countryCode === "US");
    if (usEntry) {
      return {
        ...usEntry,
        matchedAlias: "inferred-us-location",
      };
    }
  }

  for (const entry of customsRegistry) {
    const matchedAlias = entry.aliases.find((alias) => {
      const normalizedAlias = normalizeLookupValue(alias);
      return (
        normalizedDestination === normalizedAlias ||
        normalizedDestination.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedDestination)
      );
    });

    if (matchedAlias) {
      return {
        ...entry,
        matchedAlias,
      };
    }
  }

  return null;
}
