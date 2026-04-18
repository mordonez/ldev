# Changelog

## [0.5.0](https://github.com/mordonez/ldev/compare/ldev-v0.4.0...ldev-v0.5.0) (2026-04-18)

### Miscellaneous Chores

* align package version metadata with release-please workflow

## [0.4.0](https://github.com/mordonez/ldev/compare/ldev-v0.3.0...ldev-v0.4.0) (2026-04-13)


### Features

* add runtime storage modes for Docker state ([3f6dd95](https://github.com/mordonez/ldev/commit/3f6dd951cd574a270c530fc1d207d970f0970a3b))
* enhance AI installation and workspace synchronization features ([c5bd45f](https://github.com/mordonez/ldev/commit/c5bd45f07e1a69decc31f53a581269f1273aef94))
* enhance Gogo command execution and output handling in OSGi features ([2866c7d](https://github.com/mordonez/ldev/commit/2866c7d6d8134659aff6d01d61081ac89eda8ce1))
* implement admin URL builders and enhance error messages for Liferay inventory and layout features ([b6c3352](https://github.com/mordonez/ldev/commit/b6c33528931a1890be922ed99ceef223c6b1aded))
* improve portal inventory and hot deploy ([87ee816](https://github.com/mordonez/ldev/commit/87ee816a5a4f144425b5f8e85a80f37f95d8af9e))
* runtime storage modes, deploy reliability, and portal inventory hardening ([fb4adf8](https://github.com/mordonez/ldev/commit/fb4adf8fd913ab1700a69a259ca3d488d001243d))
* simplify inventory page configuration and update related tests for consistent URL handling ([b7d4eee](https://github.com/mordonez/ldev/commit/b7d4eee5b2455902ce0d796541af5324fdeffa77))
* update contextual help and agent workflow documentation for improved clarity on command usage ([39e4a55](https://github.com/mordonez/ldev/commit/39e4a5506136744ab2f239425a509cb2b821a81a))


### Bug Fixes

* add playwright-cli support to doctor checks and capabilities detection ([31db3e7](https://github.com/mordonez/ldev/commit/31db3e7ad810eb5a88c156fa51370638a83d2641))
* address PR comments and Windows restore test ([0a726df](https://github.com/mordonez/ldev/commit/0a726dfea8d98bbfd528bdd3e6e3f2d3301f91ab))
* align env restore fixture with main postgres path ([d74c98e](https://github.com/mordonez/ldev/commit/d74c98e808cb7a209e70cd7c114b330d618d4aa9))
* align gogo timeout with local profile generation ([1da9223](https://github.com/mordonez/ldev/commit/1da9223156a0a026fdf942a965eba96c12a4c1d8))
* align workspace elasticsearch and oauth scaffold behavior ([d9390e6](https://github.com/mordonez/ldev/commit/d9390e6020216a02a0a7bbff466dc524815e9ba3))
* align workspace elasticsearch and oauth scaffold behavior ([f6f3055](https://github.com/mordonez/ldev/commit/f6f3055e66260a28ac07ca939884e8df862fbeb0))
* avoid duplicate display page fields ([3d20cef](https://github.com/mordonez/ldev/commit/3d20cefd3b2a0f11eebba6b3176fc077300b0809))
* enforce mandatory worktree isolation and validation for ldev-native projects ([9c84d84](https://github.com/mordonez/ldev/commit/9c84d845a9e2e7f6773d107536fe7c169d1856cc))
* enhance issue reproduction and validation steps in documentation ([58c801e](https://github.com/mordonez/ldev/commit/58c801e00e653282371c532c349c17881d575f2b))
* enhance path removal robustness with retries and fallback for worktree clean ([d2b8c63](https://github.com/mordonez/ldev/commit/d2b8c638913dc45eb82647d52676ee4959ae5d95))
* enhance progress reporting in withProgress function and update exit code handling in fake-docker ([f4fed6d](https://github.com/mordonez/ldev/commit/f4fed6db0354a35d8c58f73adff87a7c7ba812a1))
* harden agent runtime workflows ([ecedc28](https://github.com/mordonez/ldev/commit/ecedc281cb5ce0e7641b19763a8c809b22e617a2))
* harden oauth install on windows ([8a6a621](https://github.com/mordonez/ldev/commit/8a6a621feaeff31b8a02dc3452f99626c37eef40))
* harden windows integration and runtime flows ([7d394e6](https://github.com/mordonez/ldev/commit/7d394e646f599d1367a773a81f77600f3b2262e0))
* harden windows runtime behavior ([96714a1](https://github.com/mordonez/ldev/commit/96714a1c1edc2990d22850ece26bec265a1fef73))
* honor absolute inventory page origins ([67d89d6](https://github.com/mordonez/ldev/commit/67d89d64d25877877be7adfb5f1a36f3d4a35563))
* hot deploy + cache lock + volume validation in deploy-shared ([cea2582](https://github.com/mordonez/ldev/commit/cea2582377fd045bb7103cf6a40e1e5957371d52))
* include classic portlet layout inventory ([7f39c20](https://github.com/mordonez/ldev/commit/7f39c2044d85903dedbb1859e06b182c5d01a6b3))
* normalize ai install line endings ([9847fdc](https://github.com/mordonez/ldev/commit/9847fdc8a00ab4232764c5b77ce2f3aee7698926))
* resolve partial worktree runtime context ([2bac07f](https://github.com/mordonez/ldev/commit/2bac07fb56c19fd120c73927075b8b65b29fa3b0))
* search /global as fallback when ADT not found in specified site ([f0465cf](https://github.com/mordonez/ldev/commit/f0465cf465743d491ef18b4017f96c27f7c3c625))
* tighten issue reproduction workflow ([0c5e9fe](https://github.com/mordonez/ldev/commit/0c5e9feabbc9693573c4cbc644923be09706c8f7))
* URL encode all path segments to prevent query injection in page admin URLs ([36e58b9](https://github.com/mordonez/ldev/commit/36e58b9e37995cfa1de35f9ca902f84cba967f4f))

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
