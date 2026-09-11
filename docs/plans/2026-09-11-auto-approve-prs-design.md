# PR auto-approve design

Date: 2026-09-11
Status: validated, ready to implement

## Goal

Automatically approve two classes of PRs in `fayez-nazzal/agentic-monorepo`:

- Dependabot dependency bump PRs
- PRs opened by the repo owner

Approval only. No auto-merge, the human merges manually and stays the last gate. Greptile remains the review agent, its comments stay informational and are unaffected.

## Key decisions

- **Token: GitHub App** named `Roxy Migurdia Bot`, bot identity `roxy-migurdia-bot[bot]`. The default `GITHUB_TOKEN` cannot approve Dependabot PRs (read-only on Dependabot runs) or PRs opened by the workflow trigger user, so a separate identity is required. Chosen over a PAT so the credential is not tied to the personal account and is reusable across future repos.
- **Trigger: `pull_request_target`**, because Dependabot PR workflow runs cannot read repo secrets, so a plain `pull_request` trigger would fail at the token step. Safe here since the job never checks out or executes PR code, it only approves.
- **Guard: two allowed authors only.** `github.actor == 'dependabot[bot]'` or `github.event.pull_request.user.login == github.repository_owner`. Everyone else is skipped.
- **App permissions: minimal.** Webhooks off, only `Pull requests: Read and write` on the single repo.
- **Review resolution gating: native branch protection only.** Roxy approves immediately without inspecting comment state. GitHub fires no workflow event when a review thread is resolved, so workflow-side gating would need polling. The native "Require conversation resolution" setting gives a real-time merge gate with zero custom logic.
- **Branch protection on `main`: required.** Without it, approvals and resolution gating have no teeth. Implemented via the existing ruleset `PR-merge-check` rather than classic branch protection: require a pull request, 1 approval, dismiss stale approvals on push, require conversation resolution, require the `verify` status check. Roxy's approval satisfies the approval count for owner and Dependabot PRs; PRs from others still need a human review.

## Workflow

New file `.github/workflows/auto-approve.yml`. Existing `ci.yml` untouched.

```yaml
name: auto-approve

on:
  pull_request_target:

permissions:
  contents: read
  pull-requests: write

jobs:
  approve:
    runs-on: ubuntu-latest
    if: >-
      github.actor == 'dependabot[bot]' ||
      github.event.pull_request.user.login == github.repository_owner
    steps:
      - id: app-token
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}

      - uses: hmarr/auto-approve-action@v4
        with:
          github-token: ${{ steps.app-token.outputs.token }}
```

## Repo secrets

Set in **Settings → Secrets and variables → Actions**:

- `APP_ID`: numeric App ID from the App settings page
- `APP_PRIVATE_KEY`: full contents of the generated `.pem` key, including `BEGIN`/`END` lines

The same two secrets work for any future repo, only the App install step differs per repo. The `.pem` file should be deleted from local disk once secrets are set.

## Behavior and edge cases

- PRs from anyone else: workflow skips, no approval
- New pushes: workflow re-runs and re-approves. If branch protection dismisses stale approvals, the rerun restores the approval
- Greptile: posts as usual, roxy's approval ignores Greptile's verdict
- Key failure: token step fails loudly, workflow goes red, CI keeps working
- Guard uses `github.repository_owner`, so it transfers to future personal repos and needs revisiting only for org repos with other authors

## Verification

- Own PR path: open a low-risk test PR, confirm the workflow runs green and `Roxy-Migrudia-Bot[bot]` approval appears
- Merge gate: on the same test PR, leave a review comment unresolved and confirm merge is blocked, then resolve it and confirm merge unlocks
- Direct push gate: confirm a direct push to `main` is now rejected
- Dependabot path: confirm on the next weekly `npm` bump PR, no manual trigger exists
- Regression: `ci.yml` unchanged, approval job runs on `ubuntu-latest` so macOS CI minutes are unaffected
