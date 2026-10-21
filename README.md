# AgentTutor

Korean-language learning hub for AI agents. The site brings a daily news briefing, beginner lessons, agent-engineering guides, product comparisons, a glossary, exploratory explainers, and CLI command guides into one Next.js app.

**한국어 요약.** AgentTutor는 한국어 AI 에이전트 학습 허브입니다. Today 뉴스 브리핑, Learn 기초 과정, Agent Engineering 실무 주제, Agents 제품 비교, Glossary 용어사전, Explore 설명·웹툰, CLI 명령어 가이드를 한 사이트에서 제공합니다. 앱에 기록된 운영 주소는 [https://hanstree-agenttutor-jgwu.vercel.app](https://hanstree-agenttutor-jgwu.vercel.app) 입니다.

The UI language is Korean (`app/layout.tsx` sets `lang="ko"`). Package version in `package.json` is `0.14.17`. `"private": true` in that file only stops publishing this package to the npm registry.

## Live site

Production URL recorded in the app and in the live-site checker:

[https://hanstree-agenttutor-jgwu.vercel.app](https://hanstree-agenttutor-jgwu.vercel.app)

That value is `SITE_URL` in `app/today/newsHelpers.ts` and `DEFAULT_BASE_URL` in `scripts/verify_live_site.py`. The same host is the newsletter policy URL in `scripts/news_policy.py`. RSS for the newsletter is `/feed.xml`.

`vercel.json` sets the Vercel build to Next.js, `npm ci`, and `npm run build`. `docs/GITHUB_CONNECTION.md` (checked 2026-09-30) says the public URL responded at that time, and that the Vercel dashboard Git connection and Production Branch were not confirmed from the repo.

## Features

Routes below are the ones wired in `app/nav.ts` and the App Router pages.

### Today news briefing

`/today` is the newsletter. It lists collected AI and agent articles, with source, topic, and date filters. `/releases` lists official tool releases for Codex, Claude Code, Gemini CLI, and Grok. The committed newsletter policy in `data/news-policy.json` (schema v3, revision 1) sets a 60-day official news window, a 60-hour external-source window, a 6-hour collection interval, and a page size of 10. Admins can change the live policy from `/admin/news/settings` when newsletter storage is configured. Release collection uses a separate 60-day window (`WINDOW_DAYS` in `scripts/collect_content.py`).

Card-news drafting and Instagram publishing live under `/admin/news` (including Explore webtoon publishing and Instagram connection). Those screens require the admin environment variables below.

### Learn

`/learn` is a six-step beginner roadmap: Agent Basics, LLM, Prompt, Context, Memory, and Agent Pattern. A second track, “AI의 작동 방식 이해하기”, is twelve topics under `/learn/ai-behavior`. Lesson bodies are in `data/learn.json` and `data/ai-behavior.json`.

### Agent Engineering

`/agent-engineering` documents nine topics: Tools, Skills, Hooks, Commands, MCP, Plugins, Sub Agents, Memory, and Context Management. Content is in `data/agent-engineering.json`.

### Agents comparison

`/agents` compares Claude, Codex, Gemini, Grok, DeepSeek, Muse, Qwen, and GLM, including form (App, CLI, API) and tool mode (MCP, IDE, Terminal). Model rows come from `data/agent-models.json`, which the Update Agent Models workflow refreshes from vendor docs.

### Glossary

`/glossary` defines terms used in the Learn and Agent Engineering material, with the original term, a Korean explanation, and links back to those docs. Entries are in `data/glossary.json`.

### Explore

`/explore` is a set of plain-language explainers with webtoon images and comparisons. Documents are in `data/explore.json`. Images are `public/explore/*-webtoon.png`. Each document can include a short quiz (`data/explore-quizzes.json`). Quiz grading is stateless: `docs/knowledge/QUIZ_SETUP.md` says answers are not stored and the quiz needs no extra environment variables.

### CLI guides

`/docs` serves command guides from `data/docs.json`:

| Slug | Page |
| --- | --- |
| `hanstree` | Hanstree workspace commands |
| `codex` | Codex CLI |
| `claude` | Claude Code CLI |
| `gemini` | Gemini CLI |
| `antigravity` | Antigravity CLI |
| `grok` | Grok CLI |

`sources.json` lists the official pages used to refresh Codex, Claude Code, Gemini CLI, Antigravity CLI, and Grok CLI. The Hanstree page is stored in `data/docs.json` and is not one of those fetch targets. `scripts/update_docs.py` still requires the Hanstree document to be present when it validates `data/docs.json`.

## Architecture

- **Next.js app.** `app/` is a Next.js 16 App Router project (React 19, TypeScript). Content for the public pages is imported from JSON in `data/`.
- **Python collection scripts.** `scripts/` uses the Python standard library only (no `requirements.txt`). The main jobs are `collect_content.py` (official news, releases, and document-source checks), `collect_hourly_news.py` (external feeds and optional YouTube, X, and Reddit APIs), `news_policy.py` (policy sync and schedule check), `review_glossary.py`, `update_docs.py`, `update_agent_models.py`, and `publish_news.py` (manual editorial update of an existing article). Check scripts include `check_content.py`, `check_news_features.py`, `verify_live_site.py`, `scripts/check-explore.mjs`, and `scripts/check-explore-quiz.mjs`.
- **GitHub Actions.** `.github/workflows/` runs the jobs in the next section. Scheduled jobs that change content commit and push to `master`.
- **Vercel.** `vercel.json` is the build config. The production host above is what the app and scripts call the live site.

## Local setup

GitHub Actions uses Node.js 24 and Python 3.11. `package.json` does not set an `engines` field.

```bash
npm ci
npm run dev
```

`npm run dev` starts `next dev`. `npm run build` runs `next build`. `npm start` runs `next start` after a build.

Public pages can be built from the committed JSON without the variables in `.env.example`. Copy that file to `.env.local` only when you need admin login, Redis-backed drafts, Instagram, newsletter policy storage, or a local collection run that calls GitHub, YouTube, X, or Reddit. `.gitignore` ignores `.env*` except `.env.example`.

Python jobs, from the repo root:

```bash
python3 scripts/collect_content.py news
python3 scripts/collect_content.py documents
python3 scripts/check_content.py
python3 scripts/verify_live_site.py
```

`verify_live_site.py` requests the production URL unless you pass `--base-url`. `publish_news.py` expects a review JSON path and updates editorial fields in `data/today.json`. It does not commit.

## Environment variables

Names only. Values belong in the host’s secret store, not in git. `.env.example` lists the same names with empty values.

### Read by the Next.js server

| Name | Where it is used |
| --- | --- |
| `CARD_NEWS_ADMIN_PASSWORD` | Admin login for `/admin/news` (`app/lib/card-news/server.ts`) |
| `CARD_NEWS_SIGNING_SECRET` | Session signing and Instagram token encryption. Several checks require length at least 32 |
| `CARD_NEWS_CRON_SECRET` | Bearer token for `POST /api/admin/news/prepare`. The scheduler flag treats length at least 32 as configured |
| `CARD_NEWS_PUBLIC_URL` | Public HTTPS origin for Instagram OAuth callbacks and card-news asset URLs |
| `UPSTASH_REDIS_REST_URL` | Card-news / Instagram Redis REST endpoint. Both URL and token must be set |
| `UPSTASH_REDIS_REST_TOKEN` | Token for that Redis endpoint |
| `NEWSLETTER_REDIS_REST_URL` | Dedicated Redis REST endpoint for newsletter policy. If neither newsletter variable is set, `app/lib/news-policy-store.ts` uses the Upstash pair above. If either newsletter variable is set, both must be a valid HTTPS URL and token |
| `NEWSLETTER_REDIS_REST_TOKEN` | Token for that newsletter Redis endpoint |
| `INSTAGRAM_APP_ID` | Instagram Login app id |
| `INSTAGRAM_APP_SECRET` | Instagram Login app secret |
| `INSTAGRAM_API_VERSION` | Optional. Code default is `v26.0` |
| `INSTAGRAM_USER_ID` | Legacy fixed-token publishing. Ignored while an OAuth connection is stored |
| `INSTAGRAM_ACCESS_TOKEN` | Legacy fixed user token |

`NODE_ENV` is read only to mark cookies `secure` when it equals `production`. Next.js sets it. It is not listed in `.env.example`.

### Read by collection scripts

| Name | Where it is used |
| --- | --- |
| `GITHUB_TOKEN` | `scripts/collect_content.py`, for the GitHub Releases API. Update Content sets it from `github.token` |
| `YOUTUBE_API_KEY` | `scripts/collect_hourly_news.py` when the YouTube source is enabled |
| `X_BEARER_TOKEN` | Same script, X API v2 |
| `REDDIT_CLIENT_ID` | Same script, Reddit OAuth |
| `REDDIT_CLIENT_SECRET` | Same script, Reddit OAuth |

If a required variable for YouTube, X, or Reddit is empty, that source is recorded as `not_configured` and is not requested.

### GitHub Actions configuration names

These are repository variables or secrets referenced by workflows. They are not all `process.env` keys in the app.

| Name | Kind in the workflow | Used by |
| --- | --- | --- |
| `CARD_NEWS_AUTOMATION_ENABLED` | Variable. Job runs only when the value is `true` | Prepare and publish scheduled card news |
| `CARD_NEWS_PUBLIC_URL` | Variable, passed into the job environment | Card-news workflow |
| `CARD_NEWS_CRON_SECRET` | Secret | Card-news workflow |
| `ENABLE_YOUTUBE_NEWS` | Variable. Secret is passed only when the value is `true` | Update Content |
| `ENABLE_X_NEWS` | Variable, same opt-in | Update Content |
| `ENABLE_REDDIT_NEWS` | Variable, same opt-in | Update Content |
| `YOUTUBE_API_KEY` | Secret | Update Content |
| `X_BEARER_TOKEN` | Secret | Update Content |
| `REDDIT_CLIENT_ID` | Secret | Update Content |
| `REDDIT_CLIENT_SECRET` | Secret | Update Content |
| `GITHUB_TOKEN` | Automatic Actions token (`secrets.GITHUB_TOKEN` / `github.token`) | Update Docs failure issue, and news collection |

## Automated jobs

Workflows checkout `master`, install with `npm ci`, and on success may commit back to `master` as `github-actions[bot]`. Schedules are the cron expressions in the workflow files. GitHub may start a schedule late. `docs/BATCH_JOBS.md` is an earlier operations note and does not list every current workflow.

### Update Content (`.github/workflows/update-content.yml`)

- **Triggers.** Push to `master` when this workflow, the collection scripts, `data/glossary-candidates.json`, or `data/news-policy.json` change. Cron `15 21 * * *` (comment in the file: 06:15 Asia/Seoul, for document checks and glossary review). Cron `0 * * * *` (hourly policy sync, then a KST collection decision). `workflow_dispatch` with `force_docs` and `force_glossary`.
- **Runtime.** `ubuntu-latest`, Node.js 24, Python 3.11. `contents: write`. Concurrency group `update-content` does not cancel a run already in progress. Update Agent Models uses the same group.
- **Steps.**
  1. `python3 scripts/news_policy.py sync`. Failure is continued so later steps can run, and the last step still fails the job.
  2. If sync succeeded, `python3 scripts/news_policy.py due` decides whether news collection is due.
  3. If it is due, `python3 scripts/collect_content.py news`. Otherwise `python3 scripts/collect_content.py news --releases-only`.
  4. On the 06:15 cron or on a manual run, `python3 scripts/collect_content.py documents` (with `--force` when `force_docs` is set).
  5. On that same schedule or a manual run, after a successful policy sync, `python3 scripts/review_glossary.py` (with `--force` when `force_glossary` is set).
  6. If news collection is due, `python3 scripts/collect_hourly_news.py`. YouTube, X, and Reddit credentials are passed only when the matching `ENABLE_*` variable is `true`.
  7. `npm run build`.
  8. If `data/news-policy.json`, `data/today.json`, `data/today-candidates.json`, `data/content-health.json`, `data/glossary.json`, or `.source-cache/content.json` changed, commit `chore(content): 뉴스 archive·후보 및 문서 출처 점검 갱신`, `git pull --rebase origin master`, and push `master`.
- **Failure.** The last step exits non-zero if policy sync, the schedule check, news collection, document checks, glossary review, or hourly collection failed. A failed build skips the commit.

### Update Docs (`.github/workflows/update-docs.yml`)

- **Triggers.** Cron `0 6 * * *` with `timezone: Asia/Seoul`, or `workflow_dispatch`.
- **Steps.** `python3 scripts/update_docs.py`, then `npm run build`. If the tree changed, commit `docs: 공식 문서 명령어 자동 갱신` and push `data/docs.json` and `.source-cache`. This push step does not rebase first.
- **Failure.** On failure, the workflow opens a GitHub issue titled `[자동 갱신] 공식 문서 갱신 실패` when no open issue already has that title. Permissions: `contents: write`, `issues: write`.

`update_docs.py` reads `sources.json`, compares commands with `.source-cache/snapshot.json`, and updates the five CLI documents above. It keeps the existing docs and exits if a source URL is missing, a stripped download has length under 100, no commands are extracted, the new command count is below half of the previous snapshot, or `data/docs.json` fails validation. If the snapshot file does not exist yet, the script writes the snapshot and does not change `data/docs.json`.

### Update Agent Models (`.github/workflows/update-models.yml`)

- **Triggers.** Push to `master` when this workflow or `scripts/update_agent_models.py` changes. Cron `35 21 * * *` (comment: 06:35 Asia/Seoul). `workflow_dispatch`.
- **Steps.** `python3 scripts/update_agent_models.py` (timeout 15 minutes, `continue-on-error`), then `npm run build`. If `data/agent-models.json` changed, commit `chore(agents): 모델 카탈로그 자동 점검 갱신`, rebase, and push. The job fails if the update step failed.
- **Concurrency.** Group `update-content`, shared with Update Content.

### Prepare and publish scheduled card news (`.github/workflows/prepare-card-news.yml`)

- **Triggers.** Cron `*/5 * * * *` and `workflow_dispatch`. The file comment says the server stores the editable KST times and this cron only checks whether work is due. It is not an exact-time guarantee.
- **Gate.** The job runs only when the repository variable `CARD_NEWS_AUTOMATION_ENABLED` is `true`.
- **Action.** POST `${CARD_NEWS_PUBLIC_URL}/api/admin/news/prepare` with `Authorization: Bearer ${CARD_NEWS_CRON_SECRET}`. The inline script exits if the URL is not HTTPS or the secret is shorter than 32 characters. Permissions are `contents: read`. Timeout is 7 minutes. Concurrency group `prepare-card-news` does not cancel an in-progress run.

### Not scheduled

`scripts/publish_news.py` applies a human review file onto `data/today.json` and does not push. `scripts/check_content.py` and `scripts/verify_live_site.py` only print results.

## Contributing

The default branch is `master`. Update Content, Update Docs, and Update Agent Models push to `master`, so a local branch can fall behind while you work. Update from `origin/master` before you push. `docs/GITHUB_CONNECTION.md` says not to force-push.

Do not commit secrets, `.env` files, or admin passwords. `.gitignore` already ignores `.env*` (this repo tracks `.env.example` only). Collection output that workflows commit is limited to the paths listed above.

There is no separate contribution guide in the repo. For a local check before a content change, `python3 scripts/check_content.py` and `npm run build` match checks the workflows already run.

## License

Source code in this repository is under the MIT License. Copyright (c) 2026 Steven Song. See [LICENSE](LICENSE).

Bundled fonts keep their own licenses. They are SIL Open Font License 1.1, in `public/fonts`:

- `NotoSansKR-LICENSE.txt` — Noto Sans KR. The file states Copyright 2014-2021 Adobe, with Reserved Font Name 'Source'.
- `NanumGothic-LICENSE.txt` — NanumGothic. The file states Copyright (c) 2010, NHN Corporation, with the reserved Nanum font names listed there.
- `Arimo-LICENSE.txt` — Arimo. The file states Copyright 2026 The Arimo Project Authors.

**TODO (owner): written content and webtoon images are not automatically covered by this MIT license.** That includes lesson, news, glossary, docs, and Explore text under `data/`, and the webtoon images in `public/explore/`. Decide whether that material is MIT, all rights reserved, or under another license, then replace this paragraph with the decision. Until then, do not assume the MIT grant applies to that content or to those images.
