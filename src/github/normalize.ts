import type { GitHubEvent, GitHubRepository, GitHubUser } from '../types/github.js';
import type { GitLifeStats } from '../types/gitlife.js';
import {
  calculateLanguages,
  calculateDetailedLanguages,
  calculateRepositoryTotals,
  DEFAULT_LANGUAGE_THRESHOLD_PERCENTAGE,
  rankTopRepositories,
  summarizeActivity,
} from './analytics.js';

export interface DetailedLanguageData {
  languageMaps: Array<Record<string, number>>;
  successfulRepositories: number;
  failedRepositories: number;
  totalRepositories: number;
  thresholdPercentage?: number;
}

function normalizeWebsite(value: string): string | null {
  const website = value.trim();
  if (!website) return null;
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export function normalizeGitLife(
  user: GitHubUser,
  repositories: GitHubRepository[],
  events: GitHubEvent[],
  detailedLanguageData?: DetailedLanguageData,
): GitLifeStats {
  const repositoryTotals = calculateRepositoryTotals(repositories, user.login);
  const thresholdPercentage =
    detailedLanguageData?.thresholdPercentage ?? DEFAULT_LANGUAGE_THRESHOLD_PERCENTAGE;
  const detailedLanguages = detailedLanguageData
    ? calculateDetailedLanguages(detailedLanguageData.languageMaps, thresholdPercentage)
    : [];
  const hasDetailedLanguages = detailedLanguages.length > 0;
  const languageSource = hasDetailedLanguages
    ? detailedLanguageData!.failedRepositories > 0 ? 'partial' : 'detailed'
    : 'primary';

  return {
    profile: {
      username: user.login,
      displayName: user.name?.trim() || user.login,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      bio: user.bio,
      company: user.company,
      location: user.location,
      websiteUrl: normalizeWebsite(user.blog ?? ''),
      joinedAt: user.created_at,
    },
    totals: {
      publicRepositories: user.public_repos || 0,
      ...repositoryTotals,
      followers: user.followers || 0,
      following: user.following || 0,
    },
    languages: hasDetailedLanguages ? detailedLanguages : calculateLanguages(repositories, user.login),
    languageAnalysis: {
      source: languageSource,
      approximate: languageSource !== 'detailed',
      thresholdPercentage,
      analyzedRepositories: hasDetailedLanguages
        ? detailedLanguageData!.successfulRepositories
        : repositoryTotals.analyzedRepositories,
      totalRepositories: detailedLanguageData?.totalRepositories ?? repositoryTotals.analyzedRepositories,
    },
    topRepositories: rankTopRepositories(repositories, 6, user.login),
    activity: summarizeActivity(events),
    generatedAt: new Date().toISOString(),
  };
}
