import type { GitHubEvent, GitHubRepository } from '../types/github.js';
import type { ActivitySummary, LanguageStat, RepositoryStat } from '../types/gitlife.js';

const LANGUAGE_COLORS = ['#c7ff5e', '#6ee7f2', '#a78bfa', '#fb7185', '#fbbf24', '#60a5fa'];
export const DEFAULT_LANGUAGE_THRESHOLD_PERCENTAGE = 0.5;

const EVENT_LABELS: Record<string, string> = {
  PushEvent: 'Pushes',
  PullRequestEvent: 'Pull requests',
  IssuesEvent: 'Issues',
  IssueCommentEvent: 'Discussions',
  PullRequestReviewEvent: 'Reviews',
  CreateEvent: 'Created',
  WatchEvent: 'Stars given',
  ForkEvent: 'Forks',
  ReleaseEvent: 'Releases',
};

export function ownedPublicRepositories(repositories: GitHubRepository[], username?: string) {
  const expectedOwner = username?.toLowerCase();
  return repositories.filter((repository) =>
    !repository.fork &&
    repository.private === false &&
    repository.visibility === 'public' &&
    (!expectedOwner || repository.owner.login.toLowerCase() === expectedOwner),
  );
}

export function calculateRepositoryTotals(repositories: GitHubRepository[], username?: string) {
  const owned = ownedPublicRepositories(repositories, username);
  return {
    analyzedRepositories: owned.length,
    totalStars: owned.reduce((sum, repository) => sum + (repository.stargazers_count || 0), 0),
    totalForks: owned.reduce((sum, repository) => sum + (repository.forks_count || 0), 0),
  };
}

export function calculateLanguages(repositories: GitHubRepository[], username?: string): LanguageStat[] {
  const counts = new Map<string, number>();
  for (const repository of ownedPublicRepositories(repositories, username)) {
    if (repository.language) {
      counts.set(repository.language, (counts.get(repository.language) ?? 0) + 1);
    }
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (!total) return [];

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, repositoryCount], index) => ({
      name,
      repositoryCount,
      percentage: Number(((repositoryCount / total) * 100).toFixed(1)),
      color: LANGUAGE_COLORS[index % LANGUAGE_COLORS.length],
    }));
}

export function calculateDetailedLanguages(
  languageMaps: Array<Record<string, number>>,
  thresholdPercentage = DEFAULT_LANGUAGE_THRESHOLD_PERCENTAGE,
): LanguageStat[] {
  const byteCounts = new Map<string, number>();
  const repositoryCounts = new Map<string, number>();

  for (const languages of languageMaps) {
    for (const [name, rawBytes] of Object.entries(languages)) {
      const bytes = Number.isFinite(rawBytes) && rawBytes > 0 ? rawBytes : 0;
      if (!bytes) continue;
      byteCounts.set(name, (byteCounts.get(name) ?? 0) + bytes);
      repositoryCounts.set(name, (repositoryCounts.get(name) ?? 0) + 1);
    }
  }

  const totalBytes = [...byteCounts.values()].reduce((sum, bytes) => sum + bytes, 0);
  if (!totalBytes) return [];
  const threshold = Math.min(10, Math.max(0, thresholdPercentage));

  return [...byteCounts.entries()]
    .map(([name, byteCount]) => ({
      name,
      byteCount,
      repositoryCount: repositoryCounts.get(name) ?? 0,
      percentage: Number(((byteCount / totalBytes) * 100).toFixed(1)),
    }))
    .filter((language) => language.percentage >= threshold)
    .sort((a, b) => b.byteCount - a.byteCount || a.name.localeCompare(b.name))
    .map((language, index) => ({
      ...language,
      color: LANGUAGE_COLORS[index % LANGUAGE_COLORS.length],
    }));
}

export function rankTopRepositories(
  repositories: GitHubRepository[],
  limit = 6,
  username?: string,
): RepositoryStat[] {
  return ownedPublicRepositories(repositories, username)
    .sort((a, b) =>
      b.stargazers_count - a.stargazers_count ||
      b.forks_count - a.forks_count ||
      new Date(b.pushed_at ?? b.updated_at).getTime() -
        new Date(a.pushed_at ?? a.updated_at).getTime(),
    )
    .slice(0, limit)
    .map((repository) => ({
      name: repository.name,
      url: repository.html_url,
      description: repository.description,
      language: repository.language,
      stars: repository.stargazers_count || 0,
      forks: repository.forks_count || 0,
      archived: repository.archived,
      updatedAt: repository.pushed_at ?? repository.updated_at,
    }));
}

export function summarizeActivity(events: GitHubEvent[]): ActivitySummary {
  const eventCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  let estimatedPushCommits = 0;

  const publicEvents = events.filter((event) => event.public === true);
  for (const event of publicEvents) {
    const label = EVENT_LABELS[event.type] ?? 'Other';
    eventCounts.set(label, (eventCounts.get(label) ?? 0) + 1);
    const day = event.created_at?.slice(0, 10);
    if (day) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    if (event.type === 'PushEvent') {
      estimatedPushCommits += event.payload?.distinct_size ?? event.payload?.size ?? 0;
    }
  }

  const mostActiveDay = [...dayCounts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? null;

  return {
    periodLabel: 'Last 30 days of available public events',
    totalEvents: publicEvents.length,
    estimatedPushCommits,
    activeDays: dayCounts.size,
    mostActiveDay,
    eventsByType: [...eventCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    recentEvents: publicEvents.slice(0, 8).map((event) => ({
      id: event.id,
      type: EVENT_LABELS[event.type] ?? 'Other',
      repository: event.repo?.name ?? 'Unknown repository',
      createdAt: event.created_at,
    })),
  };
}
