# Changesets

Every user-visible change adds a changeset: run `pnpm changeset`, pick the
affected packages and a bump level, and write one sentence for the changelog.
Commit the generated file together with the change.  `pnpm version-packages`
turns the pending changesets into version bumps and CHANGELOG entries.
