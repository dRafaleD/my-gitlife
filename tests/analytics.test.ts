import { describe, expect, it } from 'vitest';
import {
  calculateLanguages,
  calculateDetailedLanguages,
  calculateRepositoryTotals,
  rankTopRepositories,
  summarizeActivity,
} from '../src/github/analytics.js';
import { normalizeGitLife } from '../src/github/normalize.js';
import type { GitHubEvent, GitHubRepository, GitHubUser } from '../src/types/github.js';

function repository(overrides: Partial<GitHubRepository> = {}): GitHubRepository {
  return {
    id: 1,
    name: 'project',
    full_name: 'test/project',
    private: false,
    visibility: 'public',
    owner: { login: 'test' },
    html_url: 'https://github.com/test/project',
    description: null,
    language: 'TypeScript',
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    fork: false,
    archived: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    pushed_at: '2025-01-02T00:00:00Z',
    ...overrides,
  };
}

function event(overrides: Partial<GitHubEvent> = {}): GitHubEvent {
  return {
    id: '1',
    type: 'PushEvent',
    public: true,
    created_at: '2026-08-20T10:00:00Z',
    repo: { id: 1, name: 'test/project', url: 'https://api.github.com/repos/test/project' },
    payload: { distinct_size: 2 },
    ...overrides,
  };
}

describe('repository analytics', () => {
  it('calculates totals from owned repositories', () => {
    const result = calculateRepositoryTotals([
      repository({ stargazers_count: 7, forks_count: 3 }),
      repository({ id: 2, stargazers_count: 11, forks_count: 2 }),
    ]);

    expect(result).toEqual({ analyzedRepositories: 2, totalStars: 18, totalForks: 5 });
  });

  it('excludes forked repositories from totals and ranking', () => {
    const fork = repository({ id: 2, name: 'fork', fork: true, stargazers_count: 100 });
    const owned = repository({ id: 1, name: 'owned', stargazers_count: 2 });

    expect(calculateRepositoryTotals([fork, owned]).totalStars).toBe(2);
    expect(rankTopRepositories([fork, owned]).map((item) => item.name)).toEqual(['owned']);
  });

  it('excludes private, non-public, forked, and differently owned repositories', () => {
    const publicOwned = repository({ name: 'public-owned', stargazers_count: 3 });
    const privateRepo = repository({
      name: 'private-secret', private: true, visibility: 'private', stargazers_count: 900,
    });
    const internalRepo = repository({ name: 'internal-secret', visibility: 'internal', stargazers_count: 800 });
    const otherOwner = repository({
      name: 'other-owner', full_name: 'other/other-owner', owner: { login: 'other' }, stargazers_count: 700,
    });
    const fork = repository({ name: 'fork-secret', fork: true, stargazers_count: 600 });
    const repositories = [publicOwned, privateRepo, internalRepo, otherOwner, fork];

    expect(calculateRepositoryTotals(repositories, 'test')).toEqual({
      analyzedRepositories: 1,
      totalStars: 3,
      totalForks: 0,
    });
    expect(calculateLanguages(repositories, 'test').map((language) => language.name)).toEqual(['TypeScript']);
    expect(rankTopRepositories(repositories, 6, 'test').map((repo) => repo.name)).toEqual(['public-owned']);
  });

  it('calculates language percentages by repositories with known primary languages', () => {
    const result = calculateLanguages([
      repository({ id: 1, language: 'TypeScript' }),
      repository({ id: 2, language: 'TypeScript' }),
      repository({ id: 3, language: 'Go' }),
      repository({ id: 4, language: null }),
      repository({ id: 5, language: 'Rust', fork: true }),
    ]);

    expect(result.map(({ name, repositoryCount, percentage }) => ({ name, repositoryCount, percentage })))
      .toEqual([
        { name: 'TypeScript', repositoryCount: 2, percentage: 66.7 },
        { name: 'Go', repositoryCount: 1, percentage: 33.3 },
      ]);
  });

  it('ranks by stars, then forks, then latest push', () => {
    const result = rankTopRepositories([
      repository({ id: 1, name: 'older', stargazers_count: 5, forks_count: 2, pushed_at: '2025-01-01T00:00:00Z' }),
      repository({ id: 2, name: 'newer', stargazers_count: 5, forks_count: 2, pushed_at: '2025-02-01T00:00:00Z' }),
      repository({ id: 3, name: 'more-forks', stargazers_count: 5, forks_count: 4 }),
      repository({ id: 4, name: 'most-stars', stargazers_count: 8 }),
    ]);

    expect(result.map((item) => item.name)).toEqual(['most-stars', 'more-forks', 'newer', 'older']);
  });

  it('aggregates meaningful language byte percentages across repositories', () => {
    const result = calculateDetailedLanguages([
      {
        TypeScript: 38400,
        Python: 25100,
        Rust: 16800,
        JavaScript: 10200,
        Shell: 4700,
        'C#': 2100,
        CSS: 1400,
        HTML: 900,
        Makefile: 100,
      },
    ]);

    expect(result.map((language) => language.name)).toEqual([
      'TypeScript', 'Python', 'Rust', 'JavaScript', 'Shell', 'C#', 'CSS', 'HTML',
    ]);
    expect(result.find((language) => language.name === 'Rust')?.percentage).toBe(16.9);
    expect(result.find((language) => language.name === 'Shell')?.percentage).toBe(4.7);
    expect(result.some((language) => language.name === 'Makefile')).toBe(false);
  });
});

describe('activity analytics', () => {
  it('groups event types, active days, and commits seen in pushes', () => {
    const result = summarizeActivity([
      event(),
      event({ id: '2', created_at: '2026-08-20T12:00:00Z', payload: { size: 3 } }),
      event({ id: '3', type: 'PullRequestEvent', created_at: '2026-08-21T12:00:00Z', payload: {} }),
      event({ id: '4', type: 'UnknownEvent', created_at: '2026-08-21T13:00:00Z', payload: {} }),
    ]);

    expect(result.totalEvents).toBe(4);
    expect(result.activeDays).toBe(2);
    expect(result.estimatedPushCommits).toBe(5);
    expect(result.eventsByType).toEqual([
      { type: 'Pushes', count: 2 },
      { type: 'Other', count: 1 },
      { type: 'Pull requests', count: 1 },
    ]);
  });

  it('drops non-public events before calculating or retaining activity', () => {
    const result = summarizeActivity([
      event({ id: 'public', repo: { id: 1, name: 'test/public', url: '' } }),
      event({
        id: 'private',
        public: false,
        repo: { id: 2, name: 'test/private-secret', url: '' },
        payload: { distinct_size: 99 },
      }),
    ]);

    expect(result.totalEvents).toBe(1);
    expect(result.estimatedPushCommits).toBe(2);
    expect(result.recentEvents.map((item) => item.repository)).toEqual(['test/public']);
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });

  it('handles empty and nullable profile data', () => {
    const user: GitHubUser = {
      login: 'empty',
      name: null,
      avatar_url: 'https://avatars.githubusercontent.com/u/1',
      html_url: 'https://github.com/empty',
      bio: null,
      company: null,
      location: null,
      blog: '',
      public_repos: 0,
      followers: 0,
      following: 0,
      created_at: '2025-01-01T00:00:00Z',
    };

    const result = normalizeGitLife(user, [], []);
    expect(result.profile.displayName).toBe('empty');
    expect(result.profile.websiteUrl).toBeNull();
    expect(result.languages).toEqual([]);
    expect(result.languageAnalysis.source).toBe('primary');
    expect(result.languageAnalysis.approximate).toBe(true);
    expect(result.topRepositories).toEqual([]);
    expect(result.activity.mostActiveDay).toBeNull();
  });

  it('marks complete byte analysis as detailed and partial retrieval as approximate', () => {
    const user: GitHubUser = {
      login: 'languages', name: null, avatar_url: '', html_url: '', bio: null,
      company: null, location: null, blog: '', public_repos: 2, followers: 0,
      following: 0, created_at: '2020-01-01T00:00:00Z',
    };
    const repos = [repository({ id: 1 }), repository({ id: 2, name: 'second' })];

    const detailed = normalizeGitLife(user, repos, [], {
      languageMaps: [{ Rust: 900, Shell: 100 }],
      successfulRepositories: 2,
      failedRepositories: 0,
      totalRepositories: 2,
    });
    const partial = normalizeGitLife(user, repos, [], {
      languageMaps: [{ Rust: 900, Shell: 100 }],
      successfulRepositories: 1,
      failedRepositories: 1,
      totalRepositories: 2,
    });

    expect(detailed.languageAnalysis).toMatchObject({ source: 'detailed', approximate: false });
    expect(partial.languageAnalysis).toMatchObject({ source: 'partial', approximate: true });
  });
});
