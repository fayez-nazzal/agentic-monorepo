# Automatically approve selected PRs

Date: 2026-09-11
Status: validated, ready to implement

## Goal

Automatically approve two kinds of PRs in `fayez-nazzal/agentic-monorepo`:

- Dependabot dependency update PRs
- PRs opened by the repository owner

This only approves PRs. It does not merge them; a human merges them and remains the final check. Greptile remains the review agent, and its comments stay informational and are not affected.

## Key decisions

- **Token: GitHub App** named `Roxy Migrudia Bot`, bot identity `Roxy-Migrudia-Bot[bot]`. The default `GITHUB_TOKEN` cannot approve Dependabot PRs (read-only on Dependabot runs) or PRs opened by the workflow trigger user, so a separate identity is required. A GitHub App was chosen over a PAT so the credential is not tied to a personal account and can be reused in future repositories.
- **Trigger: `pull_request_target`**, because Dependabot PR workflow runs cannot read repository secrets, so a plain `pull_request` trigger would fail at the token step. This is safe here because the job never checks out or executes PR code; it only approves.
- **Guard: two allowed authors only.** `github.actor == 'dependabot[bot]'` or `github.event.pull_request.user.login == github.repository_owner`. Everyone else is skipped.
- **App permissions: minimal.** Webhooks are off, and the app has only `Pull requests: Read and write` permission on the single repository.
- **Review resolution gating: native branch protection only.** Roxy approves immediately without inspecting comment state. GitHub fires no workflow event when a review thread is resolved, so workflow-side gating would need polling. The native "Require conversation resolution" setting gives a real-time merge gate with no custom logic.
- **Branch protection on `main`: required.** Without it, approvals and resolution gating have no effect. Rule: require a pull request before merging, 1 approval, dismiss stale approvals, require the `verify` status check, and require conversation resolution. Roxy's approval satisfies the approval count for owner and Dependabot PRs; PRs from others still need a human review.

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

- PRs from anyone else: the workflow skips them and gives no approval.
- New pushes: the workflow runs again and re-approves. If branch protection dismisses old approvals, the new run restores the approval.
- Greptile: posts as usual; Roxy's approval ignores Greptile's verdict.
- Key failure: the token step fails clearly, the workflow turns red, and CI keeps working.
- The guard uses `github.repository_owner`, so it carries over to future personal repositories and needs review only for organization repositories with other authors.

## Verification

- Own PR path: open a low-risk test PR, confirm the workflow runs green and `Roxy-Migrudia-Bot[bot]` approval appears
- Merge gate: on the same test PR, leave a review comment unresolved and confirm merge is blocked, then resolve it and confirm merge unlocks
- Direct push gate: confirm a direct push to `main` is now rejected
- Dependabot path: confirm on the next weekly `npm` bump PR, no manual trigger exists
- Regression: `ci.yml` unchanged, approval job runs on `ubuntu-latest` so macOS CI minutes are unaffected
