# Fact pile: autoresearch-willow-performance

## Problem facts

- Willow is a Go CLI for managing git worktrees. The original post frames it as "a thin wrapper that makes the daily stuff faster without locking me out of git."
- The CLI is used in a tmux/worktree workflow at Zip, and some Zip users complained that Willow felt slow.
- The relevant slow paths were everyday commands, not rare admin flows: `ww ls`, `ww status`, `ww tmux list`, picker-style switching, and startup/empty-repo paths.
- The initial accepted baseline for the benchmark harness was `total_median_ms = 158.489ms`.
- Baseline trace hotspots included:
  - `tmux-list` / `BuildPickerItems`: `40.0ms`
  - `ls-table` / `cli.ls`: `26.8ms`
  - `status-json` / `cli.status`: `16.6ms`
  - `worktree.List`: about `14-16ms`
  - `gh.CachedMergedWorktreeSet`: `9.3ms`

## Solution facts

- `willow-autoresearch` is an extension of the broader autoresearch workflow: run a benchmark, inspect traces, make one focused change, run tests, rerun the same benchmark, keep only accepted improvements.
- The benchmark command used:

```bash
WILLOW_TELEMETRY=off python3 skills/willow-autoresearch/scripts/bench_willow.py --reference-repo <reference-fixture> --runs 7 --warmups 2 --json
```

- The merged PR is https://github.com/iamrajjoshi/willow/pull/166.
- Release containing the work: `v2.8.2`.
- Changed files in PR #166:
  - `internal/worktree/worktree.go`
  - `internal/gh/merged.go`
  - `internal/tmux/picker.go`
  - `internal/cli/ls.go`
  - `internal/cli/status.go`
  - focused tests in `internal/worktree`, `internal/gh`, and `internal/cli`
- Main optimization themes:
  - Avoid a git subprocess when the needed repo identity can be read from `.git` metadata.
  - List Willow-managed worktrees from git metadata instead of `git worktree list --porcelain`, with fallback to git if the fast path cannot prove it is safe.
  - Load `packed-refs` once per worktree listing.
  - Skip an unused tmux session lookup while building picker items.
  - Skip a failing git probe for `ww ls` outside Willow-managed repos.
  - Avoid `.lastread` checks when there are no DONE sessions.
  - Let `ww status` skip branch HEAD resolution when it only needs status output.

## Code anchors

`internal/worktree/worktree.go`:

```go
func ListWithOptions(g *git.Git, opts ListOptions) ([]Worktree, error) {
    if g.Dir != "" && !g.Verbose {
        if worktrees, ok := listFromGitMetadata(g.Dir, opts); ok {
            return worktrees, nil
        }
    }

    out, err := g.Run("worktree", "list", "--porcelain")
    if err != nil {
        return nil, err
    }
    return parsePorcelain(out), nil
}
```

`internal/gh/merged.go`:

```go
func repoCacheKey(dir string) string {
    if key, ok := repoCacheKeyFromGitMetadata(dir); ok {
        return key
    }

    cmd := exec.Command("git", "rev-parse", "--git-common-dir")
    cmd.Dir = dir
    out, err := cmd.Output()
    ...
}
```

`internal/status.go` idea:

```go
unread := hasDoneSession(sessions) && claude.CountUnreadIn(repoName, wtDir, sessions) > 0
```

## Tradeoff facts

- The work intentionally kept Willow thin. It did not replace git broadly; it added safe metadata fast paths with fallback to git.
- Fast paths are disabled for verbose git mode so the debug path still shells out and shows git behavior.
- The benchmark loop rejected multiple plausible changes as noise/regressions:
  - skip bare-config proof for resolved Willow repos
  - cache status root while reading sessions
  - target only packed refs needed by listed worktrees
  - preallocate hot-path render/status slices
- This is a good story point: autoresearch was useful not because it wrote clever code, but because it made it cheap to discard "probably faster" ideas.

## Outcome facts

- Best accepted benchmark: `total_median_ms = 56.168ms`.
- Improvement from baseline: about `64.6%` faster across the measured scenarios.
- Best accepted scenario medians:
  - `empty-ls`: `8.361ms`
  - `ls-json`: `11.274ms`
  - `ls-table`: `13.070ms`
  - `status-json`: `10.241ms`
  - `tmux-list`: `13.222ms`
- Best accepted trace medians:
  - `worktree.List`: about `2.9-3.0ms`
  - `cli.status`: `3.0ms`
  - `BuildPickerItems` / `tmux.list`: `4.9ms`
  - merged-worktree cache checks: about `0.1ms`
- Validation:
  - `go test ./... -count=1`
  - GitHub checks passed on PR #166.
  - Release workflow for `v2.8.2` completed successfully.

## Tone notes from existing posts

- Use first person singular. The personal blog uses "I" naturally.
- Start from a real complaint or skeptical moment.
- Include exact commands and code snippets.
- Keep the agent framing practical. The existing posts say "I was skeptical", "I didn't overthink it", and "it worked" instead of framing agents as magic.
- Avoid corporate phrasing. The Willow post is direct and specific: "Deleting a worktree is slow", "This one was frustrating", "Fair warning".
