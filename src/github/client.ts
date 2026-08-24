import type { GitHubEvent, GitHubRepository, GitHubUser } from '../types/github.js';
import type { GitLifeStats } from '../types/gitlife.js';
import { GitHubApiError, GitHubNotFoundError, GitHubRateLimitError } from './errors.js';
import { normalizeGitLife } from './normalize.js';
import { DEFAULT_LANGUAGE_THRESHOLD_PERCENTAGE, ownedPublicRepositories } from './analytics.js';

const API_ROOT = 'https://api.github.com';
const PER_PAGE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const PUBLIC_ENDPOINTS = [
  /^\/users\/[^/?]+$/,
  /^\/users\/[^/?]+\/repos\?type=owner&sort=updated&direction=desc&per_page=100&page=\d+$/,
  /^\/users\/[^/?]+\/events\/public\?per_page=100$/,
  /^\/repos\/[^/?]+\/[^/?]+\/languages$/,
];

export interface GitLifeRequestOptions {
  languageThresholdPercentage?: number;
  languageConcurrency?: number;
}

export interface DetailedLanguageFetchResult {
  languageMaps: Array<Record<string, number>>;
  successfulRepositories: number;
  failedRepositories: number;
  totalRepositories: number;
}

function headers(): HeadersInit {
  const result: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'my-gitlife',
  };
  if (process.env.GITHUB_TOKEN) result.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return result;
}

function rateLimitReset(response: Response): Date | null {
  const raw = response.headers.get('x-ratelimit-reset');
  if (!raw) return null;
  const date = new Date(Number(raw) * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function githubFetch<T>(path: string, username?: string): Promise<T> {
  if (!PUBLIC_ENDPOINTS.some((pattern) => pattern.test(path))) {
    throw new GitHubApiError(0, 'Refused a GitHub API request outside the public My GitLife endpoint allowlist.');
  }
  const cacheKey = `${process.env.GITHUB_TOKEN ? 'authenticated' : 'public'}:${path}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const response = await fetch(`${API_ROOT}${path}`, {
    headers: headers(),
  });

  if (response.status === 404 && username) throw new GitHubNotFoundError(username);
  if (
    response.status === 403 &&
    (response.headers.get('x-ratelimit-remaining') === '0' ||
      (await response.clone().text()).toLowerCase().includes('rate limit'))
  ) {
    throw new GitHubRateLimitError(rateLimitReset(response));
  }
  if (!response.ok) {
    throw new GitHubApiError(response.status, `GitHub API request failed with status ${response.status}.`);
  }
  const value = await response.json() as T;
  responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export function clearGitHubResponseCache() {
  responseCache.clear();
}

async function getRepositories(username: string, publicRepoCount: number) {
  const pages = Math.max(1, Math.ceil(publicRepoCount / PER_PAGE));
  const requests = Array.from({ length: pages }, (_, index) =>
    githubFetch<GitHubRepository[]>(
      `/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated&direction=desc&per_page=${PER_PAGE}&page=${index + 1}`,
      username,
    ),
  );
  return (await Promise.all(requests)).flat();
}

function normalizeConcurrency(value?: number): number {
  const configured = value ?? Number(process.env.GITLIFE_LANGUAGE_CONCURRENCY ?? 1);
  if (!Number.isFinite(configured)) return 1;
  return Math.min(3, Math.max(1, Math.floor(configured)));
}

function languageThreshold(value?: number): number {
  const configured = value ?? Number(
    process.env.GITLIFE_LANGUAGE_THRESHOLD_PERCENTAGE ?? DEFAULT_LANGUAGE_THRESHOLD_PERCENTAGE,
  );
  return Number.isFinite(configured) ? configured : DEFAULT_LANGUAGE_THRESHOLD_PERCENTAGE;
}

export async function fetchDetailedLanguages(
  username: string,
  repositories: GitHubRepository[],
  concurrency?: number,
): Promise<DetailedLanguageFetchResult> {
  const owned = ownedPublicRepositories(repositories, username);
  const languageMaps: Array<Record<string, number>> = [];
  let nextIndex = 0;
  let successfulRepositories = 0;
  let failedRepositories = 0;
  let stoppedByRateLimit = false;

  async function worker() {
    while (!stoppedByRateLimit) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= owned.length) return;
      const repository = owned[index];
      try {
        const languages = await githubFetch<Record<string, number>>(
          `/repos/${encodeURIComponent(username)}/${encodeURIComponent(repository.name)}/languages`,
        );
        languageMaps.push(languages);
        successfulRepositories += 1;
      } catch (error) {
        failedRepositories += 1;
        if (error instanceof GitHubRateLimitError) stoppedByRateLimit = true;
      }
    }
  }

  const workerCount = Math.min(normalizeConcurrency(concurrency), Math.max(owned.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  failedRepositories += owned.length - successfulRepositories - failedRepositories;

  return {
    languageMaps,
    successfulRepositories,
    failedRepositories,
    totalRepositories: owned.length,
  };
}

export async function getGitLife(
  username: string,
  options: GitLifeRequestOptions = {},
): Promise<GitLifeStats> {
  const cleanUsername = username.trim().replace(/^@/, '');
  const encodedUsername = encodeURIComponent(cleanUsername);
  const user = await githubFetch<GitHubUser>(`/users/${encodedUsername}`, cleanUsername);

  const [repositoryResponse, events] = await Promise.all([
    getRepositories(cleanUsername, user.public_repos),
    githubFetch<GitHubEvent[]>(
      `/users/${encodedUsername}/events/public?per_page=${PER_PAGE}`,
      cleanUsername,
    ),
  ]);
  const repositories = ownedPublicRepositories(repositoryResponse, cleanUsername);

  const detailedLanguages = await fetchDetailedLanguages(
    cleanUsername,
    repositories,
    options.languageConcurrency,
  );

  return normalizeGitLife(user, repositories, events, {
    ...detailedLanguages,
    thresholdPercentage: languageThreshold(options.languageThresholdPercentage),
  });
}
