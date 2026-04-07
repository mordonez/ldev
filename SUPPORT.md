# Support

## What to do first

Before opening an issue:

1. read the docs at `mordonez.github.io/ldev`
2. run `ldev doctor`
3. check the [Support Matrix](https://mordonez.github.io/ldev/support-matrix)
4. check [Product Compatibility](https://mordonez.github.io/ldev/product-compatibility)
5. check [Troubleshooting](https://mordonez.github.io/ldev/troubleshooting)

## What kind of support this repo provides

This repository is for:

- reproducible bugs in `ldev`
- docs problems
- focused feature requests
- release regressions

This repository is not a general support desk for:

- Liferay product administration
- arbitrary Docker/Desktop host debugging
- unsupported Windows-native setups
- project-specific consulting

## What makes an issue actionable

Include:

- `ldev --version`
- host OS and Docker provider
- whether the repo was created with `project init`, `project add`, or `project add-community`
- the exact command you ran
- the relevant error output
- whether `ldev doctor` reports failures
- whether you are using the documented DXP baseline or a custom image override

## Triage expectations

This is a small project. Responses may not be immediate.

Triage priority is usually:

1. regressions in documented core workflows
2. release and packaging problems
3. docs gaps or broken guidance
4. platform-specific or project-specific edge cases

Experimental platforms and heavily customized local setups may receive guidance, but they should not be treated as guaranteed support.
