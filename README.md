# fix11y-action ⚡

> **Zero-dependency, confidential GitHub Action for automated accessibility remediation.**  
> Scans HTML5, Mustache, and Handlebars templates in private repositories, detects WCAG 2.1/2.2 AA violations, runs local test verification, and opens surgical remediation Pull Requests.

---

## 🔒 Confidential Architecture for Private Repositories

`fix11y-action` is designed specifically to preserve strict data confidentiality in private repositories:
* 🛡️ **100% Air-Gapped Data Residency**: All parsing, auditing, patching, and testing occur exclusively on your own GitHub Actions runner VM.
* 🛡️ **Zero External Telemetry**: Zero repository metadata, commit SHAs, or code contents are ever transmitted to external cloud infrastructure or databases.
* 🛡️ **Native GitHub Check Runs**: Progress and summaries are surfaced natively inside GitHub's Check Run interface on your commit and pull request.
* 🛡️ **Scoped Native Credentials**: Authenticates strictly and exclusively via GitHub's auto-injected `secrets.GITHUB_TOKEN`. No private keys or third-party tokens are accepted.

---

## 🚀 Quickstart

Create `.github/workflows/fix11y.yml` in your repository:

```yaml
name: fix11y Accessibility Remediation

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  checks: write

jobs:
  remediate:
    name: Autonomous Accessibility Remediation
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run fix11y Action
        uses: 13Dav-arc/fix11y-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }} # Optional
```

---

## ⚙️ Inputs

| Input | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `github-token` | **Yes** | `${{ github.token }}` | GitHub token for creating remediation branches, check runs, and opening Pull Requests |
| `gemini-api-key` | No | `""` | Optional Google Gemini API key for AI-assisted image description |
| `target-directory` | No | `.` | Target directory containing templates to scan |
| `safe-only` | No | `'false'` | When set to `'true'`, applies only `safe`-tier fixes automatically |

---

## 🤖 Pure Deterministic Fallback Mode

When `gemini-api-key` is omitted:
1. All deterministic `safe` rules (e.g. decorative image `alt=""`, ARIA live regions) and `caution` rules (e.g. semantic `<button>` tag conversions) are applied.
2. Any complex generative AI items (e.g. informative infographics requiring text synthesis) are automatically flagged in the Pull Request body under an explicit review notice.
3. The action executes cleanly with exit code `0`.

---

## 🧪 Local Testing

Run the unit test suite:

```bash
npm test
```
