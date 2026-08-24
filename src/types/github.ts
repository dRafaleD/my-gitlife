export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  visibility: string;
  owner: {
    login: string;
  };
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  fork: boolean;
  archived: boolean;
  topics?: string[];
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
}

export interface GitHubEvent {
  id: string;
  type: string;
  public: boolean;
  created_at: string;
  repo: {
    id: number;
    name: string;
    url: string;
  };
  payload: {
    size?: number;
    distinct_size?: number;
    action?: string;
    ref_type?: string;
  };
}
