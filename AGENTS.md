# Deployment workflow

When the user says `push`, complete the release workflow without asking for additional confirmation:

1. Review and commit the current relevant changes.
2. Deploy both the Worker API and frontend to the dev environment.
3. Push the commit to `origin/main` (the repository's main integration branch).
4. Deploy both the Worker API and frontend to production.
5. Verify the working tree is clean and report the dev and production URLs.

Run the relevant frontend build and Worker typecheck before deployment. If a deployment fails, stop before the next release stage and report the failure.
