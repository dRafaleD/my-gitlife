const GITHUB_USERNAME = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export function isValidGitHubUsername(value: string) {
  return GITHUB_USERNAME.test(value) && !value.includes('--');
}
