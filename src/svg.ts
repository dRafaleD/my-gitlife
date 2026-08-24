import type {
  ActivitySummary,
  GitLifeStats,
  LanguageAnalysis,
  LanguageStat,
  RepositoryStat,
} from './types/gitlife.js';
import { CARD_THEMES, type CardTheme, type CardThemeName } from './themes.js';

export type CardStyle = 'compact' | 'story' | 'minimal';

export interface SvgCardOptions {
  style?: CardStyle;
  theme?: CardThemeName;
  avatarDataUri?: string | null;
}

interface RenderContext {
  stats: GitLifeStats;
  theme: CardTheme;
  avatarDataUri: string | null;
}

const SANS_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SAFE_AVATAR_DATA_URI = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/]*={0,2}$/i;

export function isCardStyle(value: string): value is CardStyle {
  return value === 'compact' || value === 'story' || value === 'minimal';
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

function text(value: string | number, x: number, y: number, attributes = ''): string {
  return `<text x="${x}" y="${y}" ${attributes}>${escapeXml(String(value))}</text>`;
}

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trimEnd()}…` : normalized;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function initials(displayName: string, username: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const value = parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}` : parts[0]?.slice(0, 2) || username.slice(0, 2);
  return value.toUpperCase();
}

function membership(joinedAt: string, generatedAt: string): string {
  const joined = new Date(joinedAt);
  const generated = new Date(generatedAt);
  if (Number.isNaN(joined.getTime())) return 'Join date unavailable';
  const end = Number.isNaN(generated.getTime()) ? new Date(joinedAt) : generated;
  let years = end.getUTCFullYear() - joined.getUTCFullYear();
  const beforeAnniversary =
    end.getUTCMonth() < joined.getUTCMonth() ||
    (end.getUTCMonth() === joined.getUTCMonth() && end.getUTCDate() < joined.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return years > 0 ? `Joined ${joined.getUTCFullYear()} · ${years} years on GitHub` : `Joined ${joined.getUTCFullYear()}`;
}

function avatar(context: RenderContext, x: number, y: number, size: number): string {
  const { profile } = context.stats;
  const { theme, avatarDataUri } = context;
  const radius = Math.round(size * 0.2);
  const clipId = `avatar-clip-${x}-${y}-${size}`;
  const fallback = [
    `<g data-avatar="fallback" data-x="${x}" data-y="${y}" data-size="${size}">`,
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${theme.surface}" stroke="${theme.border}"/>`,
    text(initials(profile.displayName, profile.username), x + size / 2, y + size / 2, `fill="${theme.accents[0]}" font-size="${Math.round(size * 0.28)}" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="${MONO_FONT}"`),
    '</g>',
  ].join('');
  if (!avatarDataUri || !SAFE_AVATAR_DATA_URI.test(avatarDataUri)) return fallback;
  return [
    `<g data-avatar="image" data-x="${x}" data-y="${y}" data-size="${size}">`,
    `<defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}"/></clipPath></defs>`,
    `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${escapeXml(avatarDataUri)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`,
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="none" stroke="${theme.border}"/>`,
    '</g>',
  ].join('');
}

function inlineStat(label: string, value: number, x: number, y: number, theme: CardTheme, index: number): string {
  return `<g class="stat reveal delay-${Math.min(index + 1, 4)}" data-metric="${label.toLowerCase()}">${text(compactNumber(value), x, y, `fill="${theme.text}" font-size="20" font-weight="720" font-family="${SANS_FONT}" letter-spacing="-0.4"`)}${text(label, x, y + 20, `fill="${theme.muted}" font-size="8" font-family="${MONO_FONT}" letter-spacing="0.8"`)}</g>`;
}

function languageRows(
  languages: LanguageStat[],
  x: number,
  y: number,
  width: number,
  theme: CardTheme,
  rowGap = 35,
  maxRows = 6,
  barHeight = 5,
): string {
  const rows = languages.slice(0, maxRows);
  if (!rows.length) return text('No primary language data available', x, y + 18, `fill="${theme.muted}" font-size="12" font-family="${SANS_FONT}"`);
  return rows.map((language, index) => {
    const rowY = y + index * rowGap;
    const colorOrder = [theme.accents[0], theme.accents[2], theme.accents[1], theme.accents[3]];
    const color = colorOrder[index % colorOrder.length];
    const barWidth = Math.max(5, Math.round((language.percentage / 100) * width));
    return [
      text(language.name, x, rowY, `fill="${theme.text}" font-size="12.5" font-weight="600" font-family="${SANS_FONT}"`),
      text(`${language.percentage}%`, x + width, rowY, `fill="${theme.muted}" font-size="10.5" text-anchor="end" font-family="${MONO_FONT}"`),
      `<rect x="${x}" y="${rowY + 10}" width="${width}" height="${barHeight}" rx="${barHeight / 2}" fill="${theme.border}"/>`,
      `<rect class="language-bar delay-${index + 1}" x="${x}" y="${rowY + 10}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}" fill="${color}"/>`,
    ].join('');
  }).join('');
}

interface ChipLayout {
  markup: string;
  height: number;
  lines: number;
}

interface ChipOptions {
  lineHeight?: number;
  chipHeight?: number;
  fontSize?: number;
  characterWidth?: number;
  minimumAdvance?: number;
  horizontalGap?: number;
}

function languageChips(
  languages: LanguageStat[],
  startIndex: number,
  x: number,
  y: number,
  maxWidth: number,
  theme: CardTheme,
  options: ChipOptions = {},
): ChipLayout {
  const rows = languages.slice(startIndex);
  if (!rows.length) return { markup: '', height: 0, lines: 0 };
  const lineHeight = options.lineHeight ?? 24;
  const chipHeight = options.chipHeight ?? 22;
  const fontSize = options.fontSize ?? 9;
  const characterWidth = options.characterWidth ?? 6;
  const minimumAdvance = options.minimumAdvance ?? 76;
  const horizontalGap = options.horizontalGap ?? 7;
  const topOffset = chipHeight - 6;
  const dense = options.fontSize !== undefined || options.chipHeight !== undefined;
  const dotInset = dense ? 10 : 12;
  const textInset = dense ? 18 : 22;
  let cursorX = x;
  let cursorY = y;
  let lines = 1;
  const markup = rows.map((language, itemIndex) => {
    const index = startIndex + itemIndex;
    const label = `${truncate(language.name, 12)} ${language.percentage}%`;
    const width = Math.ceil(Math.max(minimumAdvance, label.length * characterWidth + 24));
    if (cursorX > x && cursorX + width > x + maxWidth) {
      cursorX = x;
      cursorY += lineHeight;
      lines += 1;
    }
    const color = theme.accents[index % theme.accents.length];
    const chip = [
      `<g class="language-chip reveal delay-${Math.min(itemIndex + 1, 4)}">`,
      `<rect x="${cursorX}" y="${cursorY - topOffset}" width="${width - horizontalGap}" height="${chipHeight}" rx="${chipHeight / 2}" fill="${theme.surface}" stroke="${theme.border}"/>`,
      `<circle cx="${cursorX + dotInset}" cy="${cursorY - topOffset + chipHeight / 2}" r="${fontSize <= 8 ? 2.5 : 3}" fill="${color}"/>`,
      text(label, cursorX + textInset, cursorY - (fontSize <= 8 ? 2 : 1), `fill="${theme.muted}" font-size="${fontSize}" font-family="${MONO_FONT}"`),
      '</g>',
    ].join('');
    cursorX += width;
    return chip;
  }).join('');
  return { markup, height: lines * lineHeight, lines };
}

function languageSourceLabel(analysis: LanguageAnalysis): string {
  if (analysis.source === 'detailed') {
    return `BYTE-WEIGHTED · ${analysis.analyzedRepositories}/${analysis.totalRepositories} REPOS`;
  }
  if (analysis.source === 'partial') {
    return `PARTIAL BYTE DATA · ${analysis.analyzedRepositories}/${analysis.totalRepositories} REPOS`;
  }
  return 'APPROXIMATE · PRIMARY LANGUAGE FALLBACK';
}

function activityDots(activity: ActivitySummary, x: number, y: number, theme: CardTheme, count = 12): string {
  const active = Math.min(count, activity.activeDays);
  return Array.from({ length: count }, (_, index) => {
    const fill = index < active ? theme.accents[2] : theme.border;
    return `<circle class="activity-dot dot-${index + 1}" cx="${x + index * 13}" cy="${y}" r="3.5" fill="${fill}"/>`;
  }).join('');
}

function topRepository(repository: RepositoryStat | undefined, x: number, y: number, width: number, theme: CardTheme): string {
  if (!repository) return text('No public repository highlighted', x, y + 36, `fill="${theme.muted}" font-size="11" font-family="${SANS_FONT}"`);
  const metadata = `${repository.language ?? 'No language'}  ·  ★ ${compactNumber(repository.stars)}  ·  ⑂ ${compactNumber(repository.forks)}`;
  return [
    `<a href="${escapeXml(repository.url)}" data-top-repository="true">`,
    `<line x1="${x}" y1="${y}" x2="${x + Math.min(width, 32)}" y2="${y}" stroke="${theme.accents[3]}" stroke-width="2"/>`,
    text('FEATURED', x, y + 22, `fill="${theme.accents[3]}" font-size="9" font-weight="700" font-family="${MONO_FONT}" letter-spacing="1.2"`),
    text(truncate(repository.name, 30), x, y + 54, `fill="${theme.text}" font-size="18" font-weight="720" font-family="${SANS_FONT}" letter-spacing="-0.25"`),
    text(repository.description ? truncate(repository.description, 50) : 'No description provided.', x, y + 78, `fill="${theme.muted}" font-size="11" font-family="${SANS_FONT}"`),
    text(metadata, x, y + 100, `fill="${theme.muted}" font-size="9" font-family="${MONO_FONT}"`),
    '</a>',
  ].join('');
}

function compactLanguageStrip(languages: LanguageStat[], x: number, y: number, width: number, theme: CardTheme): string {
  if (!languages.length) {
    return text('No language data available', x, y + 24, `fill="${theme.muted}" font-size="10" font-family="${SANS_FONT}"`);
  }

  const shown = languages.slice(0, 5);
  const labelCount = Math.min(languages.length, 5);
  const labelStep = width / labelCount;
  let cursorX = x;
  const segments = shown.map((language, index) => {
    const segmentWidth = Math.max(4, Math.round((language.percentage / 100) * width));
    const color = theme.accents[index % theme.accents.length];
    const segment = `<rect class="language-bar delay-${index + 1}" x="${cursorX}" y="${y}" width="${segmentWidth}" height="7" fill="${color}"/>`;
    cursorX += segmentWidth;
    return segment;
  }).join('');
  const labels = shown.slice(0, 4).map((language, index) => {
    const color = theme.accents[index % theme.accents.length];
    const labelX = x + index * labelStep;
    return `<circle cx="${labelX + 3}" cy="${y + 29}" r="3" fill="${color}"/>${text(`${truncate(language.name, 10)} ${language.percentage}%`, labelX + 12, y + 32, `fill="${theme.muted}" font-size="8.5" font-family="${MONO_FONT}"`)}`;
  }).join('');
  const overflow = languages.length > 4
    ? text(`+${languages.length - 4} more`, x + 4 * labelStep + 3, y + 32, `fill="${theme.muted}" font-size="8.5" font-family="${MONO_FONT}"`)
    : '';

  return `<g data-compact-language-strip="true"><rect x="${x}" y="${y}" width="${width}" height="7" rx="3.5" fill="${theme.border}"/>${segments}${labels}${overflow}</g>`;
}

function compactActivityStrip(activity: ActivitySummary, x: number, y: number, theme: CardTheme): string {
  const active = Math.min(10, activity.activeDays);
  return Array.from({ length: 10 }, (_, index) => {
    const height = index < active ? 8 + (index % 3) * 3 : 4;
    const fill = index < active ? theme.accents[2] : theme.border;
    return `<rect class="activity-dot dot-${index + 1}" x="${x + index * 11}" y="${y - height}" width="6" height="${height}" rx="3" fill="${fill}"/>`;
  }).join('');
}

function animationStyles(): string {
  return `<style>
    .reveal { animation: reveal .55s cubic-bezier(.2,.8,.2,1) both; }
    .delay-1 { animation-delay: 70ms; }
    .delay-2 { animation-delay: 140ms; }
    .delay-3 { animation-delay: 210ms; }
    .delay-4 { animation-delay: 280ms; }
    .language-bar { transform-box: fill-box; transform-origin: left center; animation: grow .7s cubic-bezier(.2,.8,.2,1) both; }
    .activity-dot { animation: dot .35s ease-out both; }
    ${Array.from({ length: 12 }, (_, index) => `.dot-${index + 1}{animation-delay:${120 + index * 45}ms}`).join('')}
    @keyframes reveal { from { opacity: .18; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes grow { from { transform: scaleX(.04); opacity: .45; } to { transform: scaleX(1); opacity: 1; } }
    @keyframes dot { from { opacity: .2; transform: scale(.65); } to { opacity: 1; transform: scale(1); } }
    @media (prefers-reduced-motion: reduce) { .reveal, .language-bar, .activity-dot { animation: none !important; transform: none !important; opacity: 1 !important; } }
  </style>`;
}

function frame(style: CardStyle, width: number, height: number, context: RenderContext, body: string): string {
  const { profile } = context.stats;
  const { theme } = context;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="card-title card-description" data-style="${style}" data-theme="${theme.name}">
  <title id="card-title">My GitLife card for @${escapeXml(profile.username)}</title>
  <desc id="card-description">A visual summary of ${escapeXml(profile.displayName)}'s public GitHub profile.</desc>
  <defs><linearGradient id="card-background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${theme.background}"/><stop offset="1" stop-color="${theme.backgroundAlt}"/></linearGradient></defs>
  ${animationStyles()}
  <rect width="${width}" height="${height}" rx="12" fill="url(#card-background)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="11" fill="none" stroke="${theme.border}"/>
  ${body}
</svg>`;
}

function renderStory(context: RenderContext): string {
  const {
    profile,
    totals,
    languages,
    languageAnalysis,
    topRepositories,
    activity,
    generatedAt,
  } = context.stats;
  const { theme } = context;
  const bio = profile.bio ? truncate(profile.bio, 62) : 'A public GitHub journey, told through code.';
  const chips = languageChips(languages, 5, 40, 326, 508, theme, {
    lineHeight: 20,
    chipHeight: 18,
    fontSize: 9,
    characterWidth: 5.4,
    minimumAdvance: 70,
    horizontalGap: 7,
  });
  const height = Math.max(360, 350 + Math.max(0, chips.lines - 1) * 20);
  const leadingEvent = activity.eventsByType[0];
  const activityLine = leadingEvent
    ? `${activity.totalEvents} events · ${activity.activeDays} days · ${activity.estimatedPushCommits} push commits seen`
    : 'No recent public events available';
  const body = [
    `<rect x="0" y="0" width="4" height="${height}" rx="2" fill="${theme.accents[0]}"/>`,
    text('MY GITLIFE', 40, 28, `fill="${theme.muted}" font-size="9" font-weight="700" font-family="${MONO_FONT}" letter-spacing="1.6"`),
    `<g class="reveal">${avatar(context, 40, 44, 84)}</g>`,
    `<a href="${escapeXml(profile.profileUrl)}">${text(truncate(profile.displayName, 31), 144, 70, `fill="${theme.text}" font-size="28" font-weight="760" font-family="${SANS_FONT}" letter-spacing="-0.8"`)}${text(`@${truncate(profile.username, 34)}`, 144, 92, `fill="${theme.accents[2]}" font-size="11" font-family="${MONO_FONT}"`)}</a>`,
    text(bio, 144, 114, `fill="${theme.muted}" font-size="11" font-family="${SANS_FONT}"`),
    text(membership(profile.joinedAt, generatedAt), 144, 134, `fill="${theme.muted}" font-size="9" font-family="${MONO_FONT}"`),
    `<line x1="556" y1="46" x2="556" y2="132" stroke="${theme.border}"/>`,
    inlineStat('REPOS', totals.publicRepositories, 588, 74, theme, 0),
    inlineStat('STARS', totals.totalStars, 668, 74, theme, 1),
    inlineStat('FORKS', totals.totalForks, 748, 74, theme, 2),
    inlineStat('FOLLOWERS', totals.followers, 828, 74, theme, 3),
    `<line x1="40" y1="152" x2="920" y2="152" stroke="${theme.border}"/>`,
    text('LANGUAGES', 40, 176, `fill="${theme.accents[1]}" font-size="9" font-weight="700" font-family="${MONO_FONT}" letter-spacing="1.4"`),
    text(languageSourceLabel(languageAnalysis), 548, 176, `fill="${theme.muted}" font-size="7" text-anchor="end" font-family="${MONO_FONT}" letter-spacing="0.5"`),
    languageRows(languages, 40, 198, 508, theme, 24, 5, 3),
    chips.markup,
    `<line x1="572" y1="168" x2="572" y2="${height - 24}" stroke="${theme.border}"/>`,
    topRepository(topRepositories[0], 600, 168, 320, theme),
    `<line x1="600" y1="284" x2="920" y2="284" stroke="${theme.border}"/>`,
    text('RECENT', 600, 308, `fill="${theme.accents[2]}" font-size="9" font-weight="700" font-family="${MONO_FONT}" letter-spacing="1.2"`),
    text(activityLine, 600, 330, `fill="${theme.muted}" font-size="9" font-family="${MONO_FONT}"`),
    activityDots(activity, 776, 306, theme, 12),
  ].join('');
  return frame('story', 960, height, context, `<g data-layout="editorial-story">${body}</g>`);
}

function renderCompact(context: RenderContext): string {
  const {
    profile, totals, languages, languageAnalysis, topRepositories, activity,
  } = context.stats;
  const { theme } = context;
  const bio = profile.bio ? truncate(profile.bio, 40) : 'Public GitHub work, at a glance.';
  const topRepository = topRepositories[0];
  const repositoryMetadata = topRepository
    ? `${topRepository.language ?? 'No language'} · ★ ${compactNumber(topRepository.stars)} · ⑂ ${compactNumber(topRepository.forks)}`
    : '';
  const repositoryHighlight = topRepository
    ? `<a href="${escapeXml(topRepository.url)}" data-top-repository="true" data-compact-repository="true"><rect x="572" y="136" width="320" height="46" rx="8" fill="${theme.surface}" stroke="${theme.border}"/><rect x="572" y="136" width="3" height="46" rx="1.5" fill="${theme.accents[3]}"/>${text(truncate(topRepository.name, 24), 590, 163, `fill="${theme.text}" font-size="13" font-weight="700" font-family="${SANS_FONT}"`)}${text(repositoryMetadata, 878, 162, `fill="${theme.muted}" font-size="8.5" text-anchor="end" font-family="${MONO_FONT}"`)}</a>`
    : `<g data-compact-repository="true"><rect x="572" y="136" width="320" height="46" rx="8" fill="${theme.surface}" stroke="${theme.border}"/>${text('No public repository highlighted', 590, 163, `fill="${theme.muted}" font-size="10" font-family="${SANS_FONT}"`)}</g>`;
  const activityLabel = activity.totalEvents
    ? `${activity.totalEvents} EVENTS · ${activity.activeDays} DAYS`
    : 'NO RECENT EVENTS';

  const body = [
    `<rect x="0" y="0" width="4" height="224" rx="2" fill="${theme.accents[0]}"/>`,
    text('MY GITLIFE', 28, 22, `fill="${theme.muted}" font-size="8" font-weight="700" font-family="${MONO_FONT}" letter-spacing="1.4"`),
    `<g class="reveal">${avatar(context, 28, 36, 56)}</g>`,
    `<a href="${escapeXml(profile.profileUrl)}">${text(truncate(profile.displayName, 25), 100, 57, `fill="${theme.text}" font-size="20" font-weight="760" font-family="${SANS_FONT}" letter-spacing="-0.4"`)}${text(`@${truncate(profile.username, 28)}`, 100, 77, `fill="${theme.accents[2]}" font-size="9.5" font-family="${MONO_FONT}"`)}</a>`,
    text(bio, 100, 97, `fill="${theme.muted}" font-size="9.5" font-family="${SANS_FONT}"`),
    `<line x1="404" y1="30" x2="404" y2="102" stroke="${theme.border}"/>`,
    inlineStat('REPOS', totals.publicRepositories, 432, 58, theme, 0),
    inlineStat('STARS', totals.totalStars, 540, 58, theme, 1),
    inlineStat('FORKS', totals.totalForks, 648, 58, theme, 2),
    inlineStat('FOLLOWERS', totals.followers, 768, 58, theme, 3),
    `<line x1="28" y1="116" x2="892" y2="116" stroke="${theme.border}"/>`,
    text(`LANGUAGES · ${languageSourceLabel(languageAnalysis)}`, 28, 136, `fill="${theme.muted}" font-size="7.5" font-family="${MONO_FONT}" letter-spacing="0.45"`),
    compactLanguageStrip(languages, 28, 149, 510, theme),
    `<line x1="552" y1="132" x2="552" y2="204" stroke="${theme.border}"/>`,
    repositoryHighlight,
    `<g data-compact-activity="true">${text(activityLabel, 572, 207, `fill="${theme.muted}" font-size="8" font-family="${MONO_FONT}" letter-spacing="0.4"`)}${compactActivityStrip(activity, 780, 207, theme)}</g>`,
  ].join('');
  return frame('compact', 920, 224, context, `<g data-layout="compact-horizontal">${body}</g>`);
}

function renderMinimal(context: RenderContext): string {
  const {
    profile, totals, languages, languageAnalysis, topRepositories,
  } = context.stats;
  const { theme } = context;

  const chips = languageChips(languages, 0, 24, 154, 672, theme, {
    lineHeight: 22,
    chipHeight: 20,
    fontSize: 9,
    characterWidth: 5.4,
    minimumAdvance: 70,
    horizontalGap: 7,
  });

  const height = Math.max(184, 174 + Math.max(0, chips.lines - 1) * 22);
  const bio = profile.bio ? truncate(profile.bio, 50) : 'A public GitHub journey.';
  const topRepo = topRepositories[0];

  const body = [
    `<rect x="0" y="0" width="4" height="${height}" rx="2" fill="${theme.accents[0]}"/>`,
    `<g class="reveal">${avatar(context, 24, 24, 56)}</g>`,
    `<a href="${escapeXml(profile.profileUrl)}">${text(truncate(profile.displayName, 24), 96, 44, `fill="${theme.text}" font-size="20" font-weight="740" font-family="${SANS_FONT}" letter-spacing="-0.4"`)}${text(`@${truncate(profile.username, 30)}`, 96, 64, `fill="${theme.accents[2]}" font-size="10" font-family="${MONO_FONT}"`)}</a>`,
    text(bio, 96, 84, `fill="${theme.muted}" font-size="10" font-family="${SANS_FONT}"`),
    inlineStat('REPOS', totals.publicRepositories, 420, 44, theme, 0),
    inlineStat('STARS', totals.totalStars, 490, 44, theme, 1),
    inlineStat('FORKS', totals.totalForks, 560, 44, theme, 2),
    inlineStat('FOLLOWERS', totals.followers, 630, 44, theme, 3),
    text(topRepo ? `FEATURED · ${truncate(topRepo.name, 22)}` : 'NO REPOSITORY DATA', 420, 84, `fill="${theme.text}" font-size="11" font-weight="600" font-family="${SANS_FONT}" letter-spacing="0.5"`),
    text(topRepo ? `★ ${compactNumber(topRepo.stars)}` : '', 650, 84, `fill="${theme.muted}" font-size="10" font-family="${MONO_FONT}"`),
    `<line x1="24" y1="112" x2="696" y2="112" stroke="${theme.border}"/>`,
    text(`LANGUAGES · ${languageAnalysis.approximate ? 'APPROXIMATE' : 'BYTE-WEIGHTED'}`, 24, 132, `fill="${theme.accents[1]}" font-size="8" font-weight="700" font-family="${MONO_FONT}" letter-spacing="1"`),
    chips.markup || text('No language data available', 24, 154, `fill="${theme.muted}" font-size="9" font-family="${MONO_FONT}"`),
  ].join('');
  return frame('minimal', 720, height, context, `<g data-layout="minimal-strip">${body}</g>`);
}

export function generateSvgCard(stats: GitLifeStats, options: SvgCardOptions = {}): string {
  const style = options.style ?? 'story';
  const theme = CARD_THEMES[options.theme ?? 'midnight'];
  const context: RenderContext = { stats, theme, avatarDataUri: options.avatarDataUri ?? null };
  if (style === 'compact') return renderCompact(context);
  if (style === 'minimal') return renderMinimal(context);
  return renderStory(context);
}
