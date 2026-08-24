#!/usr/bin/env node

import { fetchAvatarDataUri } from './avatar.js';
import { getGitLife } from './github/client.js';
import { GitHubApiError, GitHubNotFoundError, GitHubRateLimitError } from './github/errors.js';
import { generateSvgCard, isCardStyle, type CardStyle } from './svg.js';
import { isCardThemeName, type CardThemeName } from './themes.js';
import { isValidGitHubUsername } from './validation.js';
import { writeSvgOutput } from './output.js';

interface CliOptions {
  username: string;
  output: string;
  style: CardStyle;
  theme: CardThemeName;
}

function printHelp() {
  console.log(`My GitLife — generate a visual SVG card from a public GitHub profile.

Usage:
  my-gitlife <username> [options]

Options:
  -o, --output <path>  Write the SVG to a file (default: gitlife.svg)
      --stdout         Print the SVG to stdout instead of writing a file
      --style <name>   Card style: compact, story, minimal (default: story)
      --theme <name>   Theme: midnight, github, minimal (default: midnight)
  -h, --help           Show this help

Environment:
  GITHUB_TOKEN                           Optional token for a higher API rate limit
  GITLIFE_LANGUAGE_CONCURRENCY           Language request concurrency, 1–3 (default: 1)
  GITLIFE_LANGUAGE_THRESHOLD_PERCENTAGE  Negligible-language cutoff (default: 0.5)`);
}

function parseArgs(args: string[]): CliOptions | null {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return null;
  }

  let username = '';
  let output = 'gitlife.svg';
  let style: CardStyle = 'story';
  let theme: CardThemeName = 'midnight';
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--stdout') {
      output = '';
    } else if (argument === '-o' || argument === '--output') {
      output = args[index + 1] ?? '';
      index += 1;
    } else if (argument === '--style') {
      const value = args[index + 1] ?? '';
      if (!isCardStyle(value)) throw new Error(`Unknown card style: ${value || '(missing)'}`);
      style = value;
      index += 1;
    } else if (argument === '--theme') {
      const value = args[index + 1] ?? '';
      if (!isCardThemeName(value)) throw new Error(`Unknown card theme: ${value || '(missing)'}`);
      theme = value;
      index += 1;
    } else if (!argument.startsWith('-') && !username) {
      username = argument;
    } else {
      throw new Error(`Unknown or misplaced argument: ${argument}`);
    }
  }

  const cleanUsername = username.trim().replace(/^@/, '');
  if (!cleanUsername) throw new Error('A GitHub username is required.');
  if (!isValidGitHubUsername(cleanUsername)) throw new Error(`Invalid GitHub username: ${cleanUsername}`);
  if (!output && !args.includes('--stdout')) throw new Error('An output path is required.');
  return { username: cleanUsername, output, style, theme };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) return;

  process.stderr.write(`Reading public GitHub data for @${options.username}…\n`);
  const stats = await getGitLife(options.username);
  const avatarDataUri = await fetchAvatarDataUri(stats.profile.avatarUrl);
  const svg = generateSvgCard(stats, {
    style: options.style,
    theme: options.theme,
    avatarDataUri,
  });

  if (!options.output) {
    process.stdout.write(svg);
    return;
  }

  const outputPath = await writeSvgOutput(process.cwd(), options.output, svg);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  if (error instanceof GitHubNotFoundError) {
    console.error(error.message);
  } else if (error instanceof GitHubRateLimitError) {
    const resetAt = (error as GitHubRateLimitError).resetAt;
    console.error(
      `GitHub API rate limit reached${resetAt ? `; resets at ${resetAt.toLocaleString()}` : ''}. ` +
      'Set the optional GITHUB_TOKEN environment variable to increase the request allowance.',
    );
  } else if (error instanceof GitHubApiError) {
    console.error((error as GitHubApiError).message);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('My GitLife could not generate the SVG card.');
  }
  process.exitCode = 1;
});
