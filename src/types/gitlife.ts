export interface GitLifeStats {
  profile: GitLifeProfile;
  totals: GitLifeTotals;
  languages: LanguageStat[];
  languageAnalysis: LanguageAnalysis;
  topRepositories: RepositoryStat[];
  activity: ActivitySummary;
  generatedAt: string;
}

export interface GitLifeProfile {
  username: string;
  displayName: string;
  avatarUrl: string;
  profileUrl: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  websiteUrl: string | null;
  joinedAt: string;
}

export interface GitLifeTotals {
  publicRepositories: number;
  analyzedRepositories: number;
  totalStars: number;
  totalForks: number;
  followers: number;
  following: number;
}

export interface LanguageStat {
  name: string;
  repositoryCount: number;
  percentage: number;
  color: string;
  byteCount?: number;
}

export interface LanguageAnalysis {
  source: 'detailed' | 'partial' | 'primary';
  approximate: boolean;
  thresholdPercentage: number;
  analyzedRepositories: number;
  totalRepositories: number;
}

export interface RepositoryStat {
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  archived: boolean;
  updatedAt: string;
}

export interface ActivitySummary {
  periodLabel: string;
  totalEvents: number;
  estimatedPushCommits: number;
  activeDays: number;
  mostActiveDay: string | null;
  eventsByType: Array<{ type: string; count: number }>;
  recentEvents: Array<{
    id: string;
    type: string;
    repository: string;
    createdAt: string;
  }>;
}
