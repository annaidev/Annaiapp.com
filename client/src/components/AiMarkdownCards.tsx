import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function buildGoogleSearchUrl(name: string, destinationContext?: string) {
  const query = destinationContext ? `${name} ${destinationContext}` : name;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function isPlausiblePlaceName(name: string) {
  const cleaned = name.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.includes("[") || cleaned.includes("]")) {
    return false;
  }

  const wordCount = cleaned.split(/\s+/).length;
  if (wordCount > 10 || !/[A-Za-z]/.test(cleaned)) {
    return false;
  }

  const lower = cleaned.toLowerCase();
  const blockedPrefixes = [
    "remember",
    "consider",
    "check",
    "avoid",
    "stay",
    "use",
    "bring",
    "look",
    "make",
    "keep",
    "plan",
    "tip",
    "tips",
    "note",
    "notes",
    "learn",
    "respect",
  ];

  return !blockedPrefixes.some((prefix) => lower === prefix || lower.startsWith(`${prefix} `));
}

function autoLinkPlaceRecommendations(content: string, destinationContext?: string) {
  if (!destinationContext) {
    return content;
  }

  return content.replace(
    /(^|\n)(\s*(?:\d+\.\s+|[-*\u2022]\s+))(\*\*)?(.+?)(\*\*)?(\s+(?:-|\u2013|\u2014)\s+)/g,
    (
      match,
      lineStart: string,
      prefix: string,
      _openingBold: string | undefined,
      rawName: string,
      _closingBold: string | undefined,
      separator: string,
    ) => {
      const name = rawName.trim();
      if (!isPlausiblePlaceName(name)) {
        return match;
      }

      const linkedName = `[${name}](${buildGoogleSearchUrl(name, destinationContext)})`;
      return `${lineStart}${prefix}${linkedName}${separator}`;
    },
  );
}

function normalizeAiContent(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])\s+(?=##\s)/g, "$1\n\n")
    .replace(/([^\n])\s+(?=###\s+\d+\.)/g, "$1\n\n")
    .replace(/([^\n])\s+(?=###[^\n]+)/g, "$1\n\n")
    .replace(/(##[^\n]+?)\s+(?=\d+\.\s)/g, "$1\n")
    .replace(/([^\n])\s+(?=\d+\.\s+\*\*)/g, "$1\n")
    .replace(/([^\n])\s+(?=[-*\u2022]\s+\*\*)/g, "$1\n")
    .replace(/\s+-\s+(?=\*\*)/g, "\n- ")
    .replace(/(\.\s+)(?=\*\*[^*]+\*\*:)/g, ".\n")
    .replace(/(\.\s+)(?=\d+\.\s)/g, ".\n")
    .replace(/(^|\n)(\d+)\.\s*\n+\s*/g, "$1$2. ")
    .trim();
}

function splitAiSections(content: string, destinationContext?: string) {
  const normalizeSectionLead = (section: string) => {
    const lines = section.split("\n");
    if (!lines.length) return section;

    const firstLine = lines[0]?.trim() ?? "";
    const hasNumberedLead = /^\d+\.\s+\S/.test(firstLine);
    const titleCandidate = firstLine.replace(/^\d+\.\s+/, "").trim();
    const looksLikeSectionTitle =
      titleCandidate.length >= 2 &&
      titleCandidate.length <= 90 &&
      !/https?:\/\//i.test(titleCandidate);
    const hasFollowingContent = lines.slice(1).some((line) => line.trim().length > 0);

    if (hasNumberedLead && looksLikeSectionTitle && hasFollowingContent) {
      lines[0] = `### ${titleCandidate}`;
      return lines.join("\n");
    }

    return section;
  };

  return normalizeAiContent(autoLinkPlaceRecommendations(content, destinationContext))
    .split(/\n\s*\n/)
    .map((section) => normalizeSectionLead(section.trim()))
    .map((section) => section.trim())
    .filter(Boolean);
}

export function AiMarkdownCards({
  content,
  autoLinkPlaces = false,
  destinationContext,
}: {
  content: string;
  autoLinkPlaces?: boolean;
  destinationContext?: string;
}) {
  const sections = splitAiSections(content, autoLinkPlaces ? destinationContext : undefined);

  if (!sections.length) {
    return <p className="text-sm text-muted-foreground">No details yet.</p>;
  }

  return (
    <div className="space-y-4">
      {sections.map((section, index) => (
        <div key={`section-${index}`} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h3 className="mb-3 text-lg font-semibold text-foreground">{children}</h3>,
              h2: ({ children }) => <h3 className="mb-3 text-lg font-semibold text-foreground">{children}</h3>,
              h3: ({ children }) => <h4 className="mb-3 text-base font-semibold text-foreground">{children}</h4>,
              p: ({ children }) => <p className="text-sm leading-7 text-muted-foreground">{children}</p>,
              ol: ({ children }) => <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-muted-foreground">{children}</ol>,
              ul: ({ children }) => <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">{children}</ul>,
              li: ({ children }) => <li className="pl-1">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">
                  {children}
                </a>
              ),
            }}
          >
            {section}
          </ReactMarkdown>
        </div>
      ))}
    </div>
  );
}
