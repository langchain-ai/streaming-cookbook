import {
  asArray,
  asNumber,
  asRecord,
  asString,
  execJson,
  fetchJson,
} from "./runtime.js";

type GitHubTransport = "auto" | "gh" | "token";

const githubTransport = (): GitHubTransport => {
  const value = process.env.GITHUB_TRANSPORT ?? "auto";
  if (!["auto", "gh", "token"].includes(value)) {
    throw new Error("GITHUB_TRANSPORT must be auto, gh, or token");
  }
  return value as GitHubTransport;
};

const githubToken = (): string =>
  process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || "";

const githubFetch = async <T>(path: string): Promise<T> => {
  const token = githubToken();
  if (!token) throw new Error("GITHUB_TOKEN or GH_TOKEN is required");
  const base = (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(
    /\/+$/,
    ""
  );

  return fetchJson<T>(`${base}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "langgraph-openui-dashboard",
    },
  });
};

const githubRequest = async <T>(path: string): Promise<T> => {
  const transport = githubTransport();

  if (transport === "token" || (transport === "auto" && githubToken())) {
    return githubFetch<T>(path);
  }

  try {
    return await execJson<T>("gh", [
      "api",
      "--method",
      "GET",
      "-H",
      "X-GitHub-Api-Version: 2026-03-10",
      path,
    ]);
  } catch (error) {
    if (transport === "gh") throw error;
    throw new Error(
      `GitHub CLI is unavailable or unauthenticated, and no token is configured: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

let ownerPromise: Promise<string> | undefined;

const githubOwner = (): Promise<string> => {
  const configured = process.env.GITHUB_OWNER?.trim();
  if (configured) return Promise.resolve(configured);

  ownerPromise ??= githubRequest<Record<string, unknown>>("/user").then(
    (user) => {
      const login = asString(user.login);
      if (!login) throw new Error("Could not determine authenticated GitHub owner");
      return login;
    }
  );
  return ownerPromise;
};

const ownerRepos = async (
  limit = 10
): Promise<Record<string, unknown>[]> => {
  const owner = await githubOwner();
  const query = `per_page=${Math.min(100, limit)}&sort=pushed&direction=desc&type=all`;
  try {
    const repos = await githubRequest<unknown[]>(
      `/orgs/${encodeURIComponent(owner)}/repos?${query}`
    );
    return asArray(repos).map(asRecord);
  } catch {
    const authenticated = await githubRequest<Record<string, unknown>>("/user");
    if (asString(authenticated.login).toLowerCase() === owner.toLowerCase()) {
      const repos = await githubRequest<unknown[]>(
        `/user/repos?per_page=${Math.min(
          100,
          limit
        )}&sort=pushed&direction=desc&affiliation=owner&visibility=all`
      );
      return asArray(repos).map(asRecord);
    }
    const repos = await githubRequest<unknown[]>(
      `/users/${encodeURIComponent(owner)}/repos?${query}`
    );
    return asArray(repos).map(asRecord);
  }
};

const issueSearch = async (
  qualifier: "org" | "user",
  owner: string,
  suffix: string,
  perPage: number
): Promise<Record<string, unknown>> =>
  githubRequest(
    `/search/issues?q=${encodeURIComponent(
      `${qualifier}:${owner} ${suffix}`
    )}&sort=updated&order=desc&per_page=${perPage}`
  );

export const getLiveGithubRepos = async (): Promise<unknown> => {
  const repos = (await ownerRepos(5)).slice(0, 5);
  const rows = await Promise.all(
    repos.map(async (repo) => {
      const fullName = asString(repo.full_name);
      const result = await githubRequest<Record<string, unknown>>(
        `/search/issues?q=${encodeURIComponent(
          `repo:${fullName} type:pr state:open`
        )}&per_page=1`
      );
      const openPRs = asNumber(result.total_count);
      return {
        name: asString(repo.name),
        fullName,
        language: asString(repo.language, "Unknown"),
        stars: asNumber(repo.stargazers_count),
        openIssues: Math.max(0, asNumber(repo.open_issues_count) - openPRs),
        openPRs,
      };
    })
  );

  return { repos: rows };
};

export const getLiveRecentActivity = async (
  limit: number
): Promise<unknown> => {
  const owner = await githubOwner();
  let response: Record<string, unknown>;
  try {
    response = await issueSearch(
      "org",
      owner,
      `updated:>=${new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)}`,
      limit
    );
  } catch {
    response = await issueSearch(
      "user",
      owner,
      `updated:>=${new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)}`,
      limit
    );
  }

  return {
    items: asArray(response.items).slice(0, limit).map((value) => {
      const item = asRecord(value);
      const repositoryUrl = asString(item.repository_url);
      const pullRequest = asRecord(item.pull_request);
      return {
        type: Object.keys(pullRequest).length > 0 ? "pr" : "issue",
        title: asString(item.title),
        repo: repositoryUrl.split("/").at(-1) ?? "",
        state:
          asString(pullRequest.merged_at) !== ""
            ? "merged"
            : asString(item.state),
        author: asString(asRecord(item.user).login, "unknown"),
        updatedAt: asString(item.updated_at),
      };
    }),
  };
};

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const commitActivity = async (
  fullName: string
): Promise<Record<string, unknown>[]> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await githubRequest<unknown>(
      `/repos/${fullName}/stats/commit_activity`
    );
    if (Array.isArray(result)) return result.map(asRecord);
    await sleep(1000);
  }
  return [];
};

export const getLiveCommitActivity = async (
  weeks: number
): Promise<unknown> => {
  const repos = (await ownerRepos(5)).slice(0, 5);
  const activity = await Promise.all(
    repos.map((repo) => commitActivity(asString(repo.full_name)))
  );
  const totals = new Map<number, number>();

  for (const repoWeeks of activity) {
    for (const week of repoWeeks.slice(-weeks)) {
      const timestamp = asNumber(week.week);
      if (!timestamp) continue;
      totals.set(timestamp, (totals.get(timestamp) ?? 0) + asNumber(week.total));
    }
  }

  if (totals.size === 0) {
    throw new Error("GitHub commit statistics are not ready for the selected repositories");
  }

  return {
    scope: `top ${repos.length} recently active repositories`,
    weekly: [...totals]
      .sort(([left], [right]) => left - right)
      .slice(-weeks)
      .map(([timestamp, commits]) => ({
        weekStart: new Date(timestamp * 1000).toISOString().slice(0, 10),
        commits,
      })),
  };
};
