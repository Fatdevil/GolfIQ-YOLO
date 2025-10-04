# Release Process – Back-view v1.2 Automation

This guide covers how to generate the Back-view v1.2 release notes, publish the GitHub Release, and follow-up with mobile distribution.

## 1. Trigger the automation
1. Navigate to **Actions → release v1.2 automation**.
2. Click **Run workflow** and leave defaults. The workflow:
   - Generates `dist/RELEASE_NOTES_v1.2.md` with merged PRs grouped by type.
   - Uploads the notes as an artifact (`release-notes-v1-2`).
   - Ensures the annotated tag `v1.2` (message `back-view-v1.2`) exists.
   - Publishes/updates the GitHub Release titled “Back-view v1.2 – AR-HUD MVP”.

## 2. Verify workflow outputs
1. Open the successful workflow run.
2. Download the **release-notes-v1-2** artifact and skim for accuracy (highlight bullets should match AR-HUD MVP scope).
3. Confirm the job log shows either “Tag v1.2 already exists.” or the tag push.
4. Visit the [Releases](../releases) page to ensure `Back-view v1.2 – AR-HUD MVP` uses the generated notes.

## 3. Distribute builds
1. **iOS** – Upload the latest TestFlight build and link to the release notes in the “What to Test” field.
2. **Android** – Promote the matching build to the Closed Testing track and reference the notes for reviewers.
3. Notify QA and AR-HUD stakeholders in Slack once both tracks are live, including the release URL.

## 4. Post-release checklist
- Update any downstream dashboards with the tag `v1.2`.
- Archive the release notes in the internal knowledge base (link to `dist/RELEASE_NOTES_v1.2.md`).
- Schedule golden regression follow-up if telemetry flagged anomalies.
