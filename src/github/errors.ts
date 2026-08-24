export class GitHubNotFoundError extends Error {
  constructor(username: string) {
    super(`GitHub user "${username}" was not found.`);
    this.name = 'GitHubNotFoundError';
  }
}

export class GitHubRateLimitError extends Error {
  constructor(public readonly resetAt: Date | null) {
    super('GitHub API rate limit exceeded.');
    this.name = 'GitHubRateLimitError';
  }
}

export class GitHubApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'GitHubApiError';
  }
}
