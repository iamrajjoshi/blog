# Outline: autoresearch-willow-performance

## Intake

- Topic: using autoresearch to make Willow faster
- Category: Performance / Dev Tools & Productivity
- Audience: engineers who build or use CLIs, worktrees, tmux workflows, and coding agents
- Archetype: build narrative / experiment report
- Owner: Raj Joshi
- Slug: `autoresearch-willow-performance`

## Working thesis

Willow had crossed the line from "small side-project CLI" into "tool other engineers actually use", and the complaints about latency were real enough to deserve measurement. Autoresearch made the performance work feel less like guessing and more like a tight experiment loop: trace, change one thing, test, benchmark, keep only the wins.

## Hook candidates

### Candidate 1: complaint-driven

I built Willow because I wanted git worktrees to feel less annoying. Then people at Zip started using it, which is both the best and worst thing that can happen to a side project. The best part is obvious: real users. The worst part is also obvious: real users notice when your CLI is slow.

### Candidate 2: experiment-driven

I had a performance problem and a new toy. Willow, my git worktree manager, had started to feel a little slower than a tool I run dozens of times a day should feel. Autoresearch had been useful elsewhere, but I wanted to know if it could handle a small CLI where the wins are measured in milliseconds.

### Candidate 3: benchmark-driven

The first real benchmark run said Willow spent `158.489ms` across a handful of common commands. That is not slow in the grand scheme of software, but CLIs live in a different world. If a command is in your shell muscle memory, 100 milliseconds is enough to feel sticky.

## Proposed outline

### 1. A side project gets users

- Beat list:
  - Start from the original Willow story: thin Go wrapper around git worktrees.
  - Move into the new tension: coworkers at Zip started using Willow and complained that common commands felt slow.
  - Frame the goal as "make the thing I use every day feel instant again" rather than "do an AI optimization project."
- Anchor:
  - Link back to `/blog/building-willow`.
  - Mention `ww ls`, `ww status`, `ww tmux list`, and picker flows.
- Word target: 350

### 2. Turning vague latency into a loop

- Beat list:
  - Explain autoresearch in plain language: a harness plus a rulebook for keeping only benchmark-backed changes.
  - Explain that `willow-autoresearch` is just the Willow-specific extension of that workflow.
  - Show the benchmark command with telemetry off and multiple runs/warmups.
  - Emphasize the discipline: one focused change at a time, run tests, rerun benchmark, discard noise.
- Anchor:
  - Benchmark command:

```bash
WILLOW_TELEMETRY=off python3 skills/willow-autoresearch/scripts/bench_willow.py --reference-repo <reference-fixture> --runs 7 --warmups 2 --json
```

- Word target: 450

### 3. The first trace was humbling

- Beat list:
  - Present baseline: `158.489ms`.
  - Explain the top hotspots in human terms.
  - Make the surprise clear: the slowest parts were boring, local work. Git subprocesses, metadata lookups, unnecessary tmux/status checks.
  - Mention this is where autoresearch earns its keep: it gives the agent and the human a map.
- Anchor:
  - Baseline hotspots:
    - `BuildPickerItems`: `40.0ms`
    - `cli.ls`: `26.8ms`
    - `cli.status`: `16.6ms`
    - `worktree.List`: about `14-16ms`
- Word target: 450

### 4. Optimization 1: stop asking git things Willow already knows

- Beat list:
  - Explain the original design from the Willow post: all git operations go through `Git.Run`.
  - Explain the tension: that design is simple and correct, but subprocess startup adds up in hot CLI paths.
  - Show `ListWithOptions` as a safe fast path: read metadata for Willow-managed bare repos, otherwise fall back to `git worktree list --porcelain`.
  - Mention `packed-refs` reuse.
- Anchor:
  - Code block from `internal/worktree/worktree.go`.
- Word target: 550

### 5. Optimization 2: remove work nobody was looking at

- Beat list:
  - Talk about the tmux picker and session/status surface.
  - The picker was building a session set it did not need in that path.
  - `ww status` was resolving branch heads when it only needed status.
  - Unread checks were hitting `.lastread` even when no session could be unread.
  - These are not clever changes, which is exactly the point.
- Anchor:
  - `Unread` shortcut:

```go
unread := hasDoneSession(sessions) && claude.CountUnreadIn(repoName, wtDir, sessions) > 0
```

- Word target: 450

### 6. The failed ideas were part of the result

- Beat list:
  - Mention a few rejected hypotheses.
  - Explain why this mattered: agents are good at generating plausible patches, but plausible is not the same as faster.
  - Autoresearch keeps the branch honest by reverting changes that benchmark as noise or regressions.
- Anchor:
  - Discarded attempts:
    - skip bare-config proof
    - cache status root
    - target only packed refs needed by listed worktrees
    - preallocate render/status slices
- Word target: 400

### 7. What got faster

- Beat list:
  - Present best accepted result: `158.489ms` to `56.168ms`, about `64.6%` faster.
  - Show scenario medians.
  - State the commands a reader should expect to feel faster.
  - Link PR #166 and release `v2.8.2`.
- Anchor:
  - Scenario table:

| Scenario | Median |
| --- | ---: |
| `empty-ls` | `8.361ms` |
| `ls-json` | `11.274ms` |
| `ls-table` | `13.070ms` |
| `status-json` | `10.241ms` |
| `tmux-list` | `13.222ms` |

- Word target: 400

### 8. How to try this on your own CLI

- Beat list:
  - End with practical steps, not a victory lap.
  - Pick a realistic fixture.
  - Turn telemetry/noisy remote dependencies off.
  - Run enough repetitions.
  - Add trace labels around suspicious local work.
  - Keep only changes that tests and the harness accept.
  - Note that the best outcome might be deleting code, not adding machinery.
- Anchor:
  - Small numbered checklist.
- Word target: 500

### 9. Closing: measurement made the agent useful

- Beat list:
  - Bring it back to the experiment.
  - The agent did not magically know what was slow; the loop made it useful.
  - Tie back to Willow being a tool you and coworkers use every day.
  - Optional final line: "The nicest performance work is when the tool disappears again."
- Anchor:
  - Release `v2.8.2`.
- Word target: 250

## Estimated length

3,500-4,000 words if all implementation sections are written with code. Can be tightened to about 2,500 by using only two code blocks.
