const PALETTES = [
  ["#0F4C5C", "#E36414", "#FB8B24"],
  ["#1D3557", "#457B9D", "#A8DADC"],
  ["#6B2737", "#E08E45", "#F4D35E"],
  ["#264653", "#2A9D8F", "#E9C46A"],
  ["#3D405B", "#81B29A", "#F2CC8F"],
  ["#5F0F40", "#9A031E", "#FB8B24"],
];

function hashText(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getPalette(destination: string) {
  return PALETTES[hashText(destination) % PALETTES.length];
}

function getDisplayLabel(destination: string) {
  return destination.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 2).join(", ");
}

function getInitials(destination: string) {
  const words = destination
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "A";
}

export function getDestinationImageUrl(destination: string, width: number, height: number) {
  const city = destination.split(",")[0].trim();
  return `https://loremflickr.com/${width}/${height}/${encodeURIComponent(city)},travel,landmark`;
}

export function getDestinationFallbackArt(destination: string, width: number, height: number) {
  const [start, middle, end] = getPalette(destination);
  const label = getDisplayLabel(destination)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const initials = getInitials(destination);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${start}" />
          <stop offset="55%" stop-color="${middle}" />
          <stop offset="100%" stop-color="${end}" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <circle cx="${width - 90}" cy="70" r="84" fill="rgba(255,255,255,0.12)" />
      <circle cx="90" cy="${height - 40}" r="110" fill="rgba(255,255,255,0.08)" />
      <text x="40" y="${height - 72}" font-family="Outfit, Plus Jakarta Sans, Arial, sans-serif" font-size="54" font-weight="800" fill="rgba(255,255,255,0.92)">
        ${initials}
      </text>
      <text x="40" y="${height - 28}" font-family="Outfit, Plus Jakarta Sans, Arial, sans-serif" font-size="26" font-weight="600" fill="rgba(255,255,255,0.95)">
        ${label}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
