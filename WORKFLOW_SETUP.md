# GitHub Actions Workflow Setup

## Branch Protection & Publish Workflow

The repository has branch protection rules on `main` that require all changes to go through pull requests. The publish workflow has been updated to handle this gracefully.

## Current Behavior

When the publish workflow runs on `main`:

1. ✅ Tests are executed
2. ✅ Package is built
3. ✅ Package is published to NPM
4. ⚠️ Version bump push is **skipped** (due to branch protection)

The workflow will **succeed** even if it cannot push version bumps back to main.

## Option 1: Enable Automatic Version Commits (Recommended)

To allow the workflow to automatically commit version bumps back to main, set up a Personal Access Token (PAT):

### Step 1: Create a Fine-Grained Personal Access Token

1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens?type=beta)
2. Click "Generate new token" (Fine-grained tokens)
3. Configure the token:
   - **Token name**: `mcp-financex-workflow`
   - **Expiration**: 90 days or custom
   - **Repository access**: Only select `xerktech/mcp-financex`
   - **Permissions**:
     - Contents: **Read and write**
     - Metadata: **Read-only**
   - **Note**: If your GitHub plan supports it, enable "Bypass branch protections"

4. Generate the token and copy it

### Step 2: Add Token as Repository Secret

1. Go to your repository Settings
2. Navigate to Secrets and variables > Actions
3. Click "New repository secret"
4. Name: `GH_PAT`
5. Value: Paste the token you copied
6. Click "Add secret"

### Step 3: Update Branch Protection Rules (Optional)

If you want the bot to bypass branch protection:

1. Go to repository Settings > Rules > Rulesets (or Branches)
2. Find the rule protecting `main`
3. Add an exception for the GitHub Actions bot:
   - Click "Add bypass"
   - Select "GitHub Apps" or "Actors"
   - Add: `github-actions[bot]` or the app associated with your PAT

## Option 2: Manual Version Management (Current)

If you prefer to manage versions manually through PRs:

1. Update version in `package.json` in your PR
2. Merge the PR to `main`
3. Workflow publishes to NPM with the version from `package.json`
4. No automatic commits are created

This is the **current behavior** and requires no setup.

## How It Works

The updated workflow (`publish.yml`):

```yaml
- name: Checkout code
  uses: actions/checkout@v4
  with:
    fetch-depth: 0
    token: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}
```

- If `GH_PAT` is configured: Uses it for checkout and can push to protected branches
- If `GH_PAT` is not configured: Uses default `GITHUB_TOKEN`, push is skipped gracefully

```yaml
- name: Push version bump to main
  if: steps.version_check.outputs.needs_bump == 'true'
  run: |
    git push origin main --follow-tags || echo "⚠️ Could not push to main"
  continue-on-error: true
```

- Push is non-blocking with `continue-on-error: true`
- Workflow succeeds regardless of push result
- NPM publish always completes successfully

## Testing

You can test the workflow by:

1. Merging a PR to `main`
2. Watching the "Build & Publish to NPM" workflow
3. Checking if the package appears on NPM
4. Verifying the workflow summary

## Troubleshooting

### Workflow fails with "remote rejected"
- This is expected without `GH_PAT` configured
- The workflow will continue and publish successfully
- Version management happens through PRs

### Want automatic version bumps
- Follow **Option 1** above to set up `GH_PAT`
- Ensure the token has write permissions and bypass capabilities

### Workflow succeeds but nothing published
- Check NPM_TOKEN secret is configured
- Verify version in package.json is greater than published version
- Review workflow logs for specific errors

## Security Notes

- **GH_PAT**: Store as a repository secret, never commit it
- **Token permissions**: Use fine-grained tokens with minimal permissions
- **Token expiration**: Set appropriate expiration and renew when needed
- **Audit logs**: Review repository security logs periodically
