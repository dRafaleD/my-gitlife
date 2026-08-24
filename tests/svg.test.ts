import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { generateSvgCard, type CardStyle } from '../src/svg.js';
import { CARD_THEMES, type CardThemeName } from '../src/themes.js';
import type { GitLifeStats } from '../src/types/gitlife.js';

const stats: GitLifeStats = {
  profile: {
    username: 'octo&cat',
    displayName: 'Mona <Octocat> & Friends',
    avatarUrl: 'https://avatars.githubusercontent.com/u/1',
    profileUrl: 'https://github.com/octocat?a=1&b=2',
    bio: 'Builds <things> & writes "code"',
    company: null,
    location: null,
    websiteUrl: null,
    joinedAt: '2008-01-14T04:33:35Z',
  },
  totals: {
    publicRepositories: 12,
    analyzedRepositories: 10,
    totalStars: 4200,
    totalForks: 70,
    followers: 200,
    following: 8,
  },
  languages: [
    { name: 'TypeScript', repositoryCount: 5, percentage: 38.4, color: '#71c58a', byteCount: 38400 },
    { name: 'Python', repositoryCount: 4, percentage: 25.1, color: '#72c8d5', byteCount: 25100 },
    { name: 'Rust', repositoryCount: 3, percentage: 16.8, color: '#a995ed', byteCount: 16800 },
    { name: 'JavaScript', repositoryCount: 3, percentage: 10.2, color: '#ddb36a', byteCount: 10200 },
    { name: 'Shell', repositoryCount: 2, percentage: 4.7, color: '#71c58a', byteCount: 4700 },
    { name: 'C#', repositoryCount: 1, percentage: 2.1, color: '#72c8d5', byteCount: 2100 },
    { name: 'CSS', repositoryCount: 1, percentage: 1.4, color: '#a995ed', byteCount: 1400 },
    { name: 'HTML', repositoryCount: 1, percentage: 0.9, color: '#ddb36a', byteCount: 900 },
  ],
  languageAnalysis: {
    source: 'detailed',
    approximate: false,
    thresholdPercentage: 0.5,
    analyzedRepositories: 10,
    totalRepositories: 10,
  },
  topRepositories: [{
    name: 'Hello <World>',
    url: 'https://github.com/octocat/hello-world?a=1&b=2',
    description: 'A sample repository',
    language: 'TypeScript',
    stars: 4200,
    forks: 70,
    archived: false,
    updatedAt: '2026-01-01T00:00:00Z',
  }],
  activity: {
    periodLabel: 'Recent public activity',
    totalEvents: 13,
    estimatedPushCommits: 6,
    activeDays: 5,
    mostActiveDay: '2026-01-01',
    eventsByType: [{ type: 'Pushes', count: 8 }],
    recentEvents: [],
  },
  generatedAt: '2026-01-20T00:00:00Z',
};

const styles: CardStyle[] = ['compact', 'story', 'minimal'];
const themes: CardThemeName[] = ['midnight', 'github', 'minimal'];

function dimensions(svg: string): { width: number; height: number } {
  const match = svg.match(/<svg[^>]+width="(\d+)" height="(\d+)"/);
  if (!match) throw new Error('SVG dimensions were not found');
  return { width: Number(match[1]), height: Number(match[2]) };
}

describe('SVG card variants', () => {
  it.each(styles)('renders the %s style', (style) => {
    const svg = generateSvgCard(stats, { style });
    expect(svg).toContain(`data-style="${style}"`);
    expect(svg).toMatch(/PUBLIC REPOS|>REPOS</);
    expect(svg).toMatch(/TOTAL STARS|>STARS</);
    expect(svg).toMatch(/TOTAL FORKS|>FORKS</);
    expect(svg).toContain('FOLLOWERS');
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it.each(themes)('renders the %s theme from the centralized palette', (theme) => {
    const svg = generateSvgCard(stats, { theme });
    expect(svg).toContain(`data-theme="${theme}"`);
    expect(svg).toContain(CARD_THEMES[theme].background);
    expect(svg).toContain(CARD_THEMES[theme].text);
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it.each(styles.flatMap((style) => themes.map((theme) => [style, theme] as const)))(
    'produces valid XML for %s/%s',
    (style, theme) => {
      expect(XMLValidator.validate(generateSvgCard(stats, { style, theme }))).toBe(true);
    },
  );
});

describe('SVG content and compatibility', () => {
  it('defaults to the story style and midnight theme', () => {
    const svg = generateSvgCard(stats);
    expect(svg).toContain('data-style="story"');
    expect(svg).toContain('data-theme="midnight"');
  });

  it('escapes user-provided text and links', () => {
    const svg = generateSvgCard(stats);
    expect(svg).toContain('Mona &lt;Octocat&gt; &amp; Friends');
    expect(svg).toContain('Builds &lt;things&gt; &amp; writes &quot;code&quot;');
    expect(svg).toContain('Hello &lt;World&gt;');
    expect(svg).toContain('https://github.com/octocat/hello-world?a=1&amp;b=2');
    expect(svg).not.toContain('Mona <Octocat>');
  });

  it('uses a self-contained embedded avatar when one is provided', () => {
    const avatarDataUri = 'data:image/png;base64,iVBORw0KGgo=';
    const svg = generateSvgCard(stats, { avatarDataUri });
    expect(svg).toContain('<image');
    expect(svg).toContain(avatarDataUri);
    expect(svg).not.toContain('avatars.githubusercontent.com');
  });

  it('rejects non-raster or malformed avatar data URIs at the SVG boundary', () => {
    const svgAvatar = generateSvgCard(stats, {
      avatarDataUri: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+',
    });
    const malformedAvatar = generateSvgCard(stats, { avatarDataUri: 'data:image/png;base64,%%%invalid' });
    expect(svgAvatar).not.toContain('<image');
    expect(malformedAvatar).not.toContain('<image');
  });

  it('falls back gracefully when bio, avatar, languages, and repositories are missing', () => {
    const sparse: GitLifeStats = {
      ...stats,
      profile: { ...stats.profile, displayName: '', bio: null, avatarUrl: '' },
      languages: [],
      topRepositories: [],
      activity: { ...stats.activity, totalEvents: 0, activeDays: 0, estimatedPushCommits: 0 },
    };
    const svg = generateSvgCard(sparse, { style: 'story', avatarDataUri: null });
    expect(svg).toContain('A public GitHub journey, told through code.');
    expect(svg).toContain('No primary language data available');
    expect(svg).toContain('No public repository highlighted');
    expect(svg).not.toContain('<image');
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it('is deterministic for identical normalized input and options', () => {
    const options = { style: 'compact' as const, theme: 'github' as const, avatarDataUri: null };
    expect(generateSvgCard(stats, options)).toBe(generateSvgCard(stats, options));
  });

  it('includes subtle CSS-only animation and reduced-motion handling', () => {
    const svg = generateSvgCard(stats);
    expect(svg).toContain('@keyframes reveal');
    expect(svg).toContain('@keyframes grow');
    expect(svg).toContain('class="activity-dot');
    expect(svg).toContain('@media (prefers-reduced-motion: reduce)');
    expect(svg).not.toContain('<script');
  });

  it('renders five language bars and preserves remaining languages as chips', () => {
    const svg = generateSvgCard(stats, { style: 'story' });
    expect(svg.match(/class="language-bar/g)).toHaveLength(5);
    expect(svg.match(/class="language-chip/g)).toHaveLength(3);
    for (const language of ['TypeScript', 'Python', 'Rust', 'JavaScript', 'Shell', 'C#', 'CSS', 'HTML']) {
      expect(svg).toContain(language);
    }
    expect(svg).toContain('BYTE-WEIGHTED');
  });

  it('marks fallback language data as approximate', () => {
    const approximate = {
      ...stats,
      languageAnalysis: { ...stats.languageAnalysis, source: 'primary' as const, approximate: true },
    };
    expect(generateSvgCard(approximate, { style: 'story' }))
      .toContain('APPROXIMATE · PRIMARY LANGUAGE FALLBACK');
  });

  it('supports both dark and light README contexts', () => {
    expect(CARD_THEMES.midnight.mode).toBe('dark');
    expect(CARD_THEMES.github.mode).toBe('dark');
    expect(CARD_THEMES.minimal.mode).toBe('light');
    expect(generateSvgCard(stats, { theme: 'minimal' })).toContain('#ffffff');
  });
});

describe('SVG visual layout regression', () => {
  it('keeps the flagship card within the compact README height target', () => {
    const svg = generateSvgCard(stats, { style: 'story' });
    const size = dimensions(svg);
    expect(size.width).toBe(960);
    expect(size.height).toBeGreaterThanOrEqual(340);
    expect(size.height).toBeLessThanOrEqual(380);
    expect(svg).toContain('data-layout="editorial-story"');
    expect(svg).not.toContain('PUBLIC DEVELOPER PROFILE');
    expect(svg).not.toContain('RECENT PUBLIC ACTIVITY');
  });

  it.each([
    ['story', 40, 44, 84],
    ['compact', 28, 36, 56],
    ['minimal', 24, 24, 56],
  ] as const)('aligns and clips the %s avatar to its declared frame', (style, x, y, size) => {
    const avatarDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAAB';
    const svg = generateSvgCard(stats, { style, avatarDataUri });
    expect(svg).toContain(`data-avatar="image" data-x="${x}" data-y="${y}" data-size="${size}"`);
    expect(svg).toContain(`<image x="${x}" y="${y}" width="${size}" height="${size}"`);
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain(`<rect x="${x}" y="${y}" width="${size}" height="${size}"`);
  });

  it.each([
    ['wide', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAAB'],
    ['portrait', 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD'],
  ])('uses centered cover cropping for a %s avatar source', (_shape, avatarDataUri) => {
    const svg = generateSvgCard(stats, { style: 'story', avatarDataUri });
    expect(svg).toContain('width="84" height="84"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain('clip-path="url(#avatar-clip-40-44-84)"');
  });

  it('centers the initials fallback in the same avatar geometry', () => {
    const svg = generateSvgCard(stats, { style: 'story', avatarDataUri: null });
    expect(svg).toContain('data-avatar="fallback" data-x="40" data-y="44" data-size="84"');
    expect(svg).toContain('x="82" y="86"');
    expect(svg).toContain('dominant-baseline="central"');
  });

  it('fits many meaningful languages with only a controlled flagship height increase', () => {
    const extraLanguages = ['Kotlin', 'Go', 'Java', 'Ruby', 'Swift', 'Lua', 'Dart', 'Vue', 'SCSS', 'Elixir'];
    const manyLanguages: GitLifeStats = {
      ...stats,
      languages: [
        ...stats.languages,
        ...extraLanguages.map((name, index) => ({
          name,
          repositoryCount: 1,
          percentage: Number((0.8 - index * 0.02).toFixed(1)),
          color: '#72c78d',
          byteCount: 800 - index * 20,
        })),
      ],
    };
    const svg = generateSvgCard(manyLanguages, { style: 'story' });
    expect(dimensions(svg).height).toBeGreaterThanOrEqual(360);
    expect(dimensions(svg).height).toBeLessThanOrEqual(420);
    expect(svg.match(/class="language-bar/g)).toHaveLength(5);
    expect(svg.match(/class="language-chip/g)).toHaveLength(manyLanguages.languages.length - 5);
    for (const language of manyLanguages.languages) expect(svg).toContain(language.name);
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it('truncates long visual identity lines while retaining valid accessible metadata', () => {
    const longIdentity: GitLifeStats = {
      ...stats,
      profile: {
        ...stats.profile,
        displayName: 'A Very Long Developer Display Name That Must Stay Inside The Identity Column',
        username: 'an-unusually-long-github-username-for-layout-testing',
      },
    };
    const svg = generateSvgCard(longIdentity, { style: 'story' });
    expect(svg).toContain('A Very Long Developer Display…');
    expect(svg).toContain('@an-unusually-long-github-username…');
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it('truncates long featured repository names inside the editorial column', () => {
    const longRepository: GitLifeStats = {
      ...stats,
      topRepositories: [{
        ...stats.topRepositories[0],
        name: 'abcdefghijklmnopqrstuvwxyz1234567890',
      }],
    };
    const svg = generateSvgCard(longRepository, { style: 'story' });
    expect(svg).toContain('abcdefghijklmnopqrstuvwxyz123…');
    expect(svg).not.toContain('>abcdefghijklmnopqrstuvwxyz1234567890</text>');
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it('keeps the horizontal compact card dense and the minimal geometry unchanged', () => {
    const compact = generateSvgCard(stats, { style: 'compact' });
    expect(dimensions(compact)).toEqual({ width: 920, height: 224 });
    expect(compact).toContain('data-compact-language-strip="true"');
    expect(compact).toContain('data-compact-repository="true"');
    expect(compact).toContain('data-compact-activity="true"');
    expect(compact).not.toContain('A sample repository');
    expect(compact).not.toContain('>FEATURED</text>');
    expect(dimensions(generateSvgCard(stats, { style: 'minimal' }))).toEqual({ width: 720, height: 196 });
  });

  it.each([
    ['story', 960, 420, 'editorial-story'],
    ['compact', 920, 240, 'compact-horizontal'],
    ['minimal', 720, 240, 'minimal-strip'],
  ] as const)('keeps the %s layout distinct and inside its size ceiling', (style, width, maxHeight, layout) => {
    const svg = generateSvgCard(stats, { style });
    expect(dimensions(svg).width).toBe(width);
    expect(dimensions(svg).height).toBeLessThanOrEqual(maxHeight);
    expect(svg).toContain(`data-layout="${layout}"`);
    expect(svg).not.toMatch(/undefined|NaN/);
    expect(XMLValidator.validate(svg)).toBe(true);
  });
});
