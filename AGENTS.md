# Repository Instructions

## Protected Main Branch

- Never commit directly to `main`.
- Before making a commit, confirm the current branch is not `main`. If it is,
  create or switch to a dedicated feature, fix, or maintenance branch first.
- All changes to `main` must arrive through a reviewed pull request.

## Pull Request Titles

Never prefix the PR title with `[CODEX]`.

Use a conventional-commit style subject instead.

## Commit Messages

All commits must use the conventional commit format.

Use these subject types:

- `feat`: new features
- `fix`: bug fixes
- `perf`: performance improvements
- `revert`: changes that revert other changes
- `docs`: documentation-only changes
- `refactor`: code refactoring without visible functional change
- `chore`: maintenance tasks
- `test`: test changes
- `build`: build system, packaging, or build dependency changes
- `ci`: continuous integration changes
