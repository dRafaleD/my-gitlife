import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearGitHubResponseCache,
  fetchDetailedLanguages,
  getGitLife,
  githubFetch,
} from '../src/github/client.js';
import { GitHubNotFoundError, GitHubRateLimitError } from '../src/github/errors.js';
import type { GitHubRepository } from '../src/types/github.js';

const originalGitHubToken = process.env.GITHUB_TOKEN;

function repository(name: string, fork = false, owner = 'test'): GitHubRepository {
  return {
    id: name.length,
    name,
    full_name: `${owner}/${name}`,
    private: false,
    visibility: 'public',
    owner: { login: owner },
    html_url: `https://github.com/${owner}/${name}`,
    description: null,
    language: 'TypeScript',
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    fork,
    archived: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    pushed_at: '2025-01-01T00:00:00Z',
  };
}

describe('GitHub client errors', () => {
  afterEach(() => {
    clearGitHubResponseCache();
    if (originalGitHubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGitHubToken;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps a profile 404 to GitHubNotFoundError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    ));

    await expect(githubFetch('/users/missing', 'missing')).rejects.toBeInstanceOf(GitHubNotFoundError);
  });

  it('maps a rate-limit response and preserves its reset time', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
        status: 403,
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        },
      }),
    ));

    try {
      await githubFetch('/users/test', 'test');
      throw new Error('Expected request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubRateLimitError);
      expect((error as GitHubRateLimitError).resetAt?.getTime()).toBe(reset * 1000);
    }
  });

  it('refuses authenticated-private discovery and any endpoint outside the public allowlist', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(githubFetch('/user/repos')).rejects.toThrow('public My GitLife endpoint allowlist');
    await expect(githubFetch('/users/test/events')).rejects.toThrow('public My GitLife endpoint allowlist');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a token only in the Authorization header and keeps it out of sanitized errors', async () => {
    const token = ['audit', 'secret', 'value'].join('-');
    process.env.GITHUB_TOKEN = token;
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: `server echoed ${token}` }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    let caught: unknown;
    try {
      await githubFetch('/users/test', 'test');
    } catch (error) {
      caught = error;
    }
    const requestHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(requestHeaders.Authorization).toBe(`Bearer ${token}`);
    expect(String((caught as Error).message)).not.toContain(token);
    expect(JSON.stringify(caught)).not.toContain(token);
  });

  it('isolates cached public responses by username', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const username = String(input).split('/users/')[1];
      return new Response(JSON.stringify({ login: username }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const alice = await githubFetch<{ login: string }>('/users/alice', 'alice');
    const bob = await githubFetch<{ login: string }>('/users/bob', 'bob');
    const aliceCached = await githubFetch<{ login: string }>('/users/alice', 'alice');

    expect(alice.login).toBe('alice');
    expect(bob.login).toBe('bob');
    expect(aliceCached.login).toBe('alice');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('limits detailed-language concurrency and excludes forks', async () => {
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response(JSON.stringify({ Rust: 100, Shell: 10 }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchDetailedLanguages(
      'test',
      [repository('one'), repository('two'), repository('fork', true), repository('three')],
      2,
    );

    expect(result).toMatchObject({
      successfulRepositories: 3,
      failedRepositories: 0,
      totalRepositories: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('reuses successful language responses from the short-lived request cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ Rust: 100 }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchDetailedLanguages('cached-user', [repository('cached-repo', false, 'cached-user')], 1);
    await fetchDetailedLanguages('cached-user', [repository('cached-repo', false, 'cached-user')], 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops scheduling language calls after a rate-limit response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'API rate limit exceeded' }),
      { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchDetailedLanguages(
      'test',
      [repository('one'), repository('two'), repository('three')],
      1,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      successfulRepositories: 0,
      failedRepositories: 3,
      totalRepositories: 3,
    });
  });

  it('falls back to approximate primary-language analytics when detailed requests fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/users/test')) {
        return new Response(JSON.stringify({
          login: 'test', name: 'Test', avatar_url: '', html_url: 'https://github.com/test',
          bio: null, company: null, location: null, blog: '', public_repos: 1,
          followers: 0, following: 0, created_at: '2020-01-01T00:00:00Z',
        }), { status: 200 });
      }
      if (url.includes('/users/test/repos')) {
        return new Response(JSON.stringify([repository('project')]), { status: 200 });
      }
      if (url.includes('/users/test/events/public')) {
        return new Response('[]', { status: 200 });
      }
      if (url.includes('/repos/test/project/languages')) {
        return new Response(JSON.stringify({ message: 'temporary failure' }), { status: 500 });
      }
      return new Response('{}', { status: 404 });
    }));

    const result = await getGitLife('test');
    expect(result.languages.map((language) => language.name)).toEqual(['TypeScript']);
    expect(result.languageAnalysis).toMatchObject({ source: 'primary', approximate: true });
  });

  it('never requests or normalizes private, forked, or differently owned repositories', async () => {
    const publicRepo = repository('public-project');
    const privateRepo = { ...repository('private-secret'), private: true, visibility: 'private' };
    const fork = repository('fork-secret', true);
    const otherOwner = repository('other-secret', false, 'other');
    const requestedUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith('/users/test')) {
        return new Response(JSON.stringify({
          login: 'test', name: 'Test', avatar_url: '', html_url: 'https://github.com/test',
          bio: null, company: null, location: null, blog: '', public_repos: 4,
          followers: 0, following: 0, created_at: '2020-01-01T00:00:00Z',
        }), { status: 200 });
      }
      if (url.includes('/users/test/repos')) {
        return new Response(JSON.stringify([publicRepo, privateRepo, fork, otherOwner]), { status: 200 });
      }
      if (url.includes('/users/test/events/public')) {
        return new Response(JSON.stringify([{
          id: 'public', type: 'PushEvent', public: true, created_at: '2026-08-20T00:00:00Z',
          repo: { id: 1, name: 'test/public-project', url: '' }, payload: { distinct_size: 1 },
        }, {
          id: 'private', type: 'PushEvent', public: false, created_at: '2026-08-20T00:00:00Z',
          repo: { id: 2, name: 'test/private-event-secret', url: '' }, payload: { distinct_size: 99 },
        }]), { status: 200 });
      }
      if (url.includes('/repos/test/public-project/languages')) {
        return new Response(JSON.stringify({ Rust: 100 }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }));

    const result = await getGitLife('test');
    const serialized = JSON.stringify(result);
    expect(result.totals.analyzedRepositories).toBe(1);
    expect(result.topRepositories.map((repo) => repo.name)).toEqual(['public-project']);
    expect(result.activity.totalEvents).toBe(1);
    expect(requestedUrls.filter((url) => url.endsWith('/languages'))).toEqual([
      'https://api.github.com/repos/test/public-project/languages',
    ]);
    expect(serialized).not.toMatch(/private-secret|fork-secret|other-secret|private-event-secret/);
  });

  it('does not reuse another username language data during rate-limit fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      const username = url.includes('/alice') ? 'alice' : 'bob';
      if (url.endsWith(`/users/${username}`)) {
        return new Response(JSON.stringify({
          login: username, name: username, avatar_url: '', html_url: `https://github.com/${username}`,
          bio: null, company: null, location: null, blog: '', public_repos: 1,
          followers: 0, following: 0, created_at: '2020-01-01T00:00:00Z',
        }), { status: 200 });
      }
      if (url.includes(`/users/${username}/repos`)) {
        const repo = repository(`${username}-project`, false, username);
        repo.language = username === 'alice' ? 'Rust' : 'Python';
        return new Response(JSON.stringify([repo]), { status: 200 });
      }
      if (url.includes(`/users/${username}/events/public`)) return new Response('[]', { status: 200 });
      if (url.includes('/repos/alice/alice-project/languages')) {
        return new Response(JSON.stringify({ Rust: 100 }), { status: 200 });
      }
      if (url.includes('/repos/bob/bob-project/languages')) {
        return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0' },
        });
      }
      return new Response('{}', { status: 404 });
    }));

    const alice = await getGitLife('alice');
    const bob = await getGitLife('bob');

    expect(alice.languages.map((language) => language.name)).toEqual(['Rust']);
    expect(alice.languageAnalysis.source).toBe('detailed');
    expect(bob.languages.map((language) => language.name)).toEqual(['Python']);
    expect(bob.languageAnalysis).toMatchObject({ source: 'primary', approximate: true });
    expect(JSON.stringify(bob)).not.toContain('alice-project');
  });
});
