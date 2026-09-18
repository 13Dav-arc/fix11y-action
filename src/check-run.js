/**
 * Native GitHub Check Run updater for fix11y-action.
 * Zero external dependencies.
 */

export class CheckRunManager {
  constructor({ token, owner, repo, baseUrl = 'https://api.github.com' } = {}) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.baseUrl = baseUrl;
  }

  async createCheckRun({ headSha, name = 'fix11y Accessibility Audit' }) {
    if (!this.token || !this.owner || !this.repo) {
      console.log(`[INFO] CheckRunManager: Running without token/repo context — skipping GitHub Check Run creation.`);
      return null;
    }

    try {
      const res = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/check-runs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'fix11y-action/1.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          head_sha: headSha,
          status: 'in_progress',
          output: {
            title: 'fix11y: Scanning web templates...',
            summary: 'Auditing HTML and template files for WCAG 2.1/2.2 AA violations.',
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.warn(`[WARNING] Failed to create Check Run (${res.status}): ${text}`);
        return null;
      }

      const data = await res.json();
      return data.id;
    } catch (err) {
      console.warn(`[WARNING] Error creating Check Run: ${err.message}`);
      return null;
    }
  }

  async updateCheckRun({ checkRunId, status = 'completed', conclusion, title, summary, text = '' }) {
    if (!this.token || !this.owner || !this.repo || !checkRunId) {
      console.log(`[CHECK-RUN] Conclusion: ${conclusion} | Title: "${title}" | Summary: "${summary}"`);
      return;
    }

    try {
      const res = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/check-runs/${checkRunId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'fix11y-action/1.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          conclusion,
          output: {
            title,
            summary,
            text,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[WARNING] Failed to update Check Run (${res.status}): ${errText}`);
      }
    } catch (err) {
      console.warn(`[WARNING] Error updating Check Run: ${err.message}`);
    }
  }
}
