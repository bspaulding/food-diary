# CI Workflow Setup

This document describes the CI workflow configuration and how to enable required status checks for pull requests.

## Current Configuration

The CI workflow (`.github/workflows/ci.yml`) is configured to:

- Run on all push events to any branch
- Run on all pull request events to any branch
- Execute tests with Node.js in the America/Los_Angeles timezone

## Making CI a Required Check

To make the CI workflow passing a requirement for merging pull requests, follow these steps:

1. Navigate to your repository on GitHub
2. Go to **Settings** > **Branches**
3. Under "Branch protection rules", click **Add rule** or edit an existing rule
4. For "Branch name pattern", enter `main` (or whichever branch you want to protect)
5. Check **Require status checks to pass before merging**
6. Check **Require branches to be up to date before merging** (recommended)
7. In the search box that appears, search for and select: **test**
   - This is the job name from the CI workflow
8. Optionally, check **Require approvals** if you want code reviews required
9. Click **Create** or **Save changes**

## Alternative: Using Rulesets (GitHub's newer feature)

You can also use GitHub Rulesets for more flexible configuration:

1. Navigate to your repository on GitHub
2. Go to **Settings** > **Rules** > **Rulesets**
3. Click **New ruleset** > **New branch ruleset**
4. Name it (e.g., "Main branch protection")
5. Set target branches to `main`
6. Under "Branch protections", enable **Require status checks to pass**
7. Click **Add checks** and select **test**
8. Set enforcement to **Active**
9. Click **Create**

## Verifying the Configuration

Once configured, pull requests to the protected branch will:

- Show the CI status check in the PR
- Prevent merging if the CI check fails
- Display "Required" next to the CI check status
