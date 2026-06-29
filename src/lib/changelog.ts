import { readFile } from "node:fs/promises";
import path from "node:path";

const GITHUB_REPO = "manuelmmontufarm-dev/mesita-app";
const ECUADOR_TIME_ZONE = "America/Guayaquil";

export type ChangeCategory =
  | "Experiencia"
  | "Integración"
  | "Rendimiento"
  | "Datos"
  | "Seguridad"
  | "Producto";

export interface CommitChange {
  sha: string;
  title: string;
  description: string | null;
  category: ChangeCategory;
  committedAt: string;
  url: string;
  author: string;
}

export interface DailyChanges {
  date: string;
  label: string;
  entries: CommitChange[];
}

export interface TodayEntry {
  date: string;
  title: string;
  what: string | null;
  why: string | null;
  effect: string | null;
}

interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
    committer: { name: string; date: string } | null;
  };
  author: { login: string } | null;
}

function localDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ECUADOR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ECUADOR_TIME_ZONE,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function cleanTitle(raw: string): string {
  const cleaned = raw
    .replace(/^\[codex\]\s*/i, "")
    .replace(/^(feat|fix|perf|refactor|docs|chore|build|style|test)(\([^)]*\))?!?:\s*/i, "")
    .replace(/\s*\(#\d+\)\s*$/, "")
    .trim();
  if (!cleaned) return "Actualización del producto";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function cleanDescription(lines: string[]): string | null {
  const description = lines
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^co-authored-by:/i.test(line) &&
        !/^signed-off-by:/i.test(line) &&
        !/^https?:\/\//i.test(line),
    )
    .join(" ")
    .replace(/^[-*]\s*/, "")
    .slice(0, 260);
  return description || null;
}

function categoryFor(message: string): ChangeCategory {
  const text = message.toLowerCase();
  if (/perf|speed|veloc|cache|redis|latenc|optim|poll|render/.test(text)) return "Rendimiento";
  if (/security|auth|login|secret|token|permission|segur/.test(text)) return "Seguridad";
  if (/database|prisma|schema|migration|supabase|index|db\b/.test(text)) return "Datos";
  if (/pos|api|sync|integr|webhook|vercel|deploy|connect/.test(text)) return "Integración";
  if (/ux|ui|visual|mobile|scroll|button|layout|design|dock|css/.test(text)) return "Experiencia";
  return "Producto";
}

export async function getDailyChanges(limit = 40): Promise<DailyChanges[]> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=${Math.min(limit, 100)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        next: { revalidate: 900 },
      },
    );
    if (!response.ok) return [];

    const commits = (await response.json()) as GitHubCommit[];
    const grouped = new Map<string, CommitChange[]>();

    for (const commit of commits) {
      const lines = commit.commit.message.split("\n");
      const committedAt = commit.commit.author?.date ?? commit.commit.committer?.date;
      if (!committedAt) continue;
      const date = localDateKey(committedAt);
      const entry: CommitChange = {
        sha: commit.sha.slice(0, 7),
        title: cleanTitle(lines[0]),
        description: cleanDescription(lines.slice(1)),
        category: categoryFor(commit.commit.message),
        committedAt,
        url: commit.html_url,
        author: commit.author?.login ?? commit.commit.author?.name ?? "Equipo Mesita",
      };
      grouped.set(date, [...(grouped.get(date) ?? []), entry]);
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, entries]) => ({ date, label: dateLabel(date), entries }));
  } catch {
    return [];
  }
}

function stripMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldFromBody(body: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(
    new RegExp(`(?:^|\\n)(?:-\\s*)?\\*\\*${escaped}:?\\*\\*:?\\s*([\\s\\S]*?)(?=\\n(?:-\\s*)?\\*\\*[^*]+\\*\\*|\\n---|$)`, "i"),
  );
  return match ? stripMarkdown(match[1]).slice(0, 500) : null;
}

export async function getTodayEntries(limit = 8): Promise<TodayEntry[]> {
  try {
    const markdown = await readFile(path.join(process.cwd(), "TODAY.md"), "utf8");
    const matches = [...markdown.matchAll(/^###\s+(\d{4}-\d{2}-\d{2})\s+—\s+(.+)$/gm)];
    return matches.slice(0, limit).map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[index + 1]?.index ?? markdown.length;
      const body = markdown.slice(start, end);
      return {
        date: match[1],
        title: stripMarkdown(match[2]),
        what: fieldFromBody(body, "Qué"),
        why: fieldFromBody(body, "Por qué"),
        effect: fieldFromBody(body, "Qué hace"),
      };
    });
  } catch {
    return [];
  }
}

export const changelogRepositoryUrl = `https://github.com/${GITHUB_REPO}/commits/main`;
export const changelogRevalidateSeconds = 900;

export function getLastUpdatedFromDays(days: DailyChanges[]): string | null {
  let latest: string | null = null;
  for (const day of days) {
    for (const entry of day.entries) {
      if (!latest || entry.committedAt > latest) latest = entry.committedAt;
    }
  }
  return latest;
}

export function formatLastUpdated(iso: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ECUADOR_TIME_ZONE,
  }).format(new Date(iso));
}
