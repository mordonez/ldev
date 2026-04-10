# Changelog

## [0.3.0](https://github.com/mordonez/ldev/compare/ldev-v0.2.2...ldev-v0.3.0) (2026-04-10)


### Features

* add Journal content prune and scoped content inventory ([95f8b27](https://github.com/mordonez/ldev/commit/95f8b2702ff3ce987319e8529bdfd639d1dc2884))
* **ai:** add --local mode to ai install ([9090fbf](https://github.com/mordonez/ldev/commit/9090fbf22edb4f15710970063d88374d4e5362d3))
* **ai:** add local install mode for agent tooling ([3175e22](https://github.com/mordonez/ldev/commit/3175e220cb366cfb1d5ed8c1a5e47e5efb8d2106))
* **portal:** add content metrics to inventory sites ([1909d32](https://github.com/mordonez/ldev/commit/1909d3261652c7b8c2633ce4c66b6b64851e4391))
* **portal:** add journal content prune command ([0bf9a44](https://github.com/mordonez/ldev/commit/0bf9a44a72f9bb2d39b6563abc0bd98b16dbd975))
* **portal:** add ldev portal content prune command ([18478d2](https://github.com/mordonez/ldev/commit/18478d20201158aa50c5a3f60bddbf09d5f1a66c))


### Bug Fixes

* **ai:** normalize local gitignore handling ([313b687](https://github.com/mordonez/ldev/commit/313b6873ef1604852f6bdca5727b88a8418db5df))
* allow worktree setup from current branch ([f1d5bc6](https://github.com/mordonez/ldev/commit/f1d5bc6aa8d7bb413915094f69f9ed48bc8602bd))
* allow worktree setup from current branch ([23fe8e1](https://github.com/mordonez/ldev/commit/23fe8e1b7c9e5e23b833895e149b6f9f8ce22db0))
* **db:** prepare env data layout before import ([5f6d01d](https://github.com/mordonez/ldev/commit/5f6d01d259269a2cdaac2a801bd824074b1300a4))
* improve ADT lookup and docs consistency ([92aa9da](https://github.com/mordonez/ldev/commit/92aa9da70cf00361a62a73d320e60d3d3218ec44))
* **liferay:** use user endpoint for portal check ([22e343e](https://github.com/mordonez/ldev/commit/22e343eacc5e56ac28283f81947929ffd58b77c1))
* **oauth:** sync oauth install credentials and idempotency ([4603851](https://github.com/mordonez/ldev/commit/460385105c9152ca3d04edfb721df29d2332ebfc)), closes [#16](https://github.com/mordonez/ldev/issues/16)
* **oauth:** sync oauth install credentials and idempotency ([0cb1c26](https://github.com/mordonez/ldev/commit/0cb1c2679f872d9e8e1466d4a6fe931c14b8dd4e)), closes [#16](https://github.com/mordonez/ldev/issues/16)
* **portal:** address inventory and prune review feedback ([66823f3](https://github.com/mordonez/ldev/commit/66823f3c8a59a95add602b157f7893cb358d8d25))
* **portal:** tighten content inventory and prune behavior ([158de51](https://github.com/mordonez/ldev/commit/158de5131ad9a7c8cba1f2abd9943508713c6511))
* **resource:** search ADTs across accessible sites ([352dc13](https://github.com/mordonez/ldev/commit/352dc13b3ce1c8bdc774bdfff9bef35cb30a8e23))
* use &lt;env&gt; placeholder instead of hardcoded 'production' in troubleshooting skill ([f04d20b](https://github.com/mordonez/ldev/commit/f04d20b6aa064bc1d7267736eca2a1657332ca25))
* use user endpoint for portal check ([eea64f7](https://github.com/mordonez/ldev/commit/eea64f704d99b783a477e1fe07c6b0b0b9a7aa2e))

## [0.2.2](https://github.com/mordonez/ldev/compare/ldev-v0.2.1...ldev-v0.2.2) (2026-04-08)


### Bug Fixes

* **resource:** simplify ADT inspection workflow ([a5e6633](https://github.com/mordonez/ldev/commit/a5e66335528f83df53090e69eb2d2764224a2cf1))

## [0.2.1](https://github.com/mordonez/ldev/compare/ldev-v0.2.0...ldev-v0.2.1) (2026-04-07)


### Bug Fixes

* ignore stdin in runProcess to prevent lcp interactive prompts from hanging ([fea078a](https://github.com/mordonez/ldev/commit/fea078a78fde51ec766b4ec763d2edbe2d0aff95))
* project init create dockerenv folder ([1825c79](https://github.com/mordonez/ldev/commit/1825c791fd5f05add8bcb23abc8b16b663b34485))

## [0.2.0](https://github.com/mordonez/ldev/compare/ldev-v0.1.0...ldev-v0.2.0) (2026-04-07)


### Features

* first public release v0.1.0 ([192fb03](https://github.com/mordonez/ldev/commit/192fb03a0abefd9b543407b0712158b721318ff2))


### Bug Fixes

* adjust sleep test timeout to reduce flakiness ([7989d51](https://github.com/mordonez/ldev/commit/7989d519ff10542e0d092335339fd84f00eb109b))
* ensure .gitkeep files are created in the Docker scaffold ([a4d3f34](https://github.com/mordonez/ldev/commit/a4d3f3458e38ed3281eea9dada5a4359f4bc1002))
* improve error handling in streamSqlIntoPostgres and update test include paths and coverage thresholds ([9fbd6e6](https://github.com/mordonez/ldev/commit/9fbd6e69648f8d3fac2cf8dcbad74054f58a3b89))
* resolve GitHub Actions workflows ([dda9f85](https://github.com/mordonez/ldev/commit/dda9f8563f91fca77eab80907f0a423433fba6ab))
* resolve TypeScript linting errors in cli-command-helpers test ([b4a040c](https://github.com/mordonez/ldev/commit/b4a040c7a0d3c043c9d1d1eafdb84a1e12915188))
* simplify .gitignore by removing specific docker entries ([f1c2c11](https://github.com/mordonez/ldev/commit/f1c2c11f413012a0cbd4b634d9ddcaaf5bd5675e))
* update installed CLI path to reflect new package name ([9f1e160](https://github.com/mordonez/ldev/commit/9f1e1608bd13657d9c6e792629cf18d05e6317d0))
* update package name from [@mordonez](https://github.com/mordonez) to [@mordonezdev](https://github.com/mordonezdev) ([a217780](https://github.com/mordonez/ldev/commit/a2177808f0adac57b62dfaa97d7095b1f5993ba1))
* update package name in .gitignore to match new naming convention ([d4b4faa](https://github.com/mordonez/ldev/commit/d4b4faaf7c5f04b8a60bbc2f623f4919904c612b))
* update package name in smoke tests and release package creation ([58937c3](https://github.com/mordonez/ldev/commit/58937c38d7d27a507a13e6d3fad8d70d1938307e))
* update package naming in release workflow ([774077f](https://github.com/mordonez/ldev/commit/774077fd19c1a3c7e3afb84e18b82b8899c86984))
* update PostgreSQL environment handling in runDbImport function ([4d8f4b2](https://github.com/mordonez/ldev/commit/4d8f4b2ed079f6012a18e35bf1ff2859dfa4b528))
* update SBOM action parameters to use 'file' instead of 'path' ([9f4fa19](https://github.com/mordonez/ldev/commit/9f4fa19ea338284268ea7fe69af479c12485fb08))


### Reverts

* config vitest ([a5060fb](https://github.com/mordonez/ldev/commit/a5060fb00c5ead9f4354caf81cb4036af86c0dda))
