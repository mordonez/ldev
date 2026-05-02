# Changelog

## [0.6.0](https://github.com/mordonez/ldev/compare/ldev-v0.5.4...ldev-v0.6.0) (2026-05-02)


### Features

* **mcp:** expand local MCP server support ([#131](https://github.com/mordonez/ldev/issues/131)) ([bb479b1](https://github.com/mordonez/ldev/commit/bb479b1b9efd9ffcedb1473cbe5709c3824befda))

## [0.5.4](https://github.com/mordonez/ldev/compare/ldev-v0.5.3...ldev-v0.5.4) (2026-04-28)


### Bug Fixes

* **ai:** refactor skills with reference architecture and fill command gaps ([#125](https://github.com/mordonez/ldev/issues/125)) ([51218e3](https://github.com/mordonez/ldev/commit/51218e326d0e03c53b1e9839f07d98ca281734a1))
* **inventory:** multi-site structure and template discovery ([#127](https://github.com/mordonez/ldev/issues/127)) ([ca441e8](https://github.com/mordonez/ldev/commit/ca441e8ce3077afd29766acbce6b645d0576cb6a))
* **worktree:** support external linked git worktrees ([#128](https://github.com/mordonez/ldev/issues/128)) ([f45fdf6](https://github.com/mordonez/ldev/commit/f45fdf6de6c3c53e6c55edc831302b0aecee56af))

## [0.5.3](https://github.com/mordonez/ldev/compare/ldev-v0.5.2...ldev-v0.5.3) (2026-04-27)


### Bug Fixes

* **ai:** clarify validation processes for non-trivial changes and visual evidence ([0c33d4e](https://github.com/mordonez/ldev/commit/0c33d4e78207db23ac6b111447be733dc6247ded))
* **ai:** make workflow gates scope-aware and developer-flexible ([0c33d4e](https://github.com/mordonez/ldev/commit/0c33d4e78207db23ac6b111447be733dc6247ded))
* **db:** ensure postgres volume is removed after container cleanup in db import ([#121](https://github.com/mordonez/ldev/issues/121)) ([84e0b59](https://github.com/mordonez/ldev/commit/84e0b594cdfd47cf0bdbade54f44b19aeea6da0f))
* **deploy:** add client-extension and war deploy support ([#117](https://github.com/mordonez/ldev/issues/117)) ([85929c6](https://github.com/mordonez/ldev/commit/85929c6a8a8d09ffe8d2fae48fd080d42b70662d))
* **inventory:** simplify portal inventory page with minimal default contract and --full mode  ([#123](https://github.com/mordonez/ldev/issues/123)) ([a49142d](https://github.com/mordonez/ldev/commit/a49142d5ffe39b15d6f40c98e2c11b08a5335f0c))

## [0.5.2](https://github.com/mordonez/ldev/compare/ldev-v0.5.1...ldev-v0.5.2) (2026-04-24)


### Bug Fixes

* add AI bootstrap and scoped doctor probes for agent context ([#113](https://github.com/mordonez/ldev/issues/113)) ([366eb7a](https://github.com/mordonez/ldev/commit/366eb7a431b2bfa52f1ddb49405b2d553108f486))
* add global repo-root targeting and worktree handoff flow ([#115](https://github.com/mordonez/ldev/issues/115)) ([feb32d2](https://github.com/mordonez/ldev/commit/feb32d2a215f19bb6377cd3ad59c959f577f0abd))
* **ai-templates:** harden AI templates for small-model safety and cross-OS compatibility ([#116](https://github.com/mordonez/ldev/issues/116)) ([a4ae0a1](https://github.com/mordonez/ldev/commit/a4ae0a191a6330b68f12029fca1875a3cd0d3585))

## [0.5.1](https://github.com/mordonez/ldev/compare/ldev-v0.5.0...ldev-v0.5.1) (2026-04-21)


### Bug Fixes

* **ai:** preserve official workspace copilot file under force ([1cc637a](https://github.com/mordonez/ldev/commit/1cc637a99686d7b31855c4fc5898ea7b307ba26a))
* **ai:** scope force overwrite to explicitly requested install surfaces ([e5b0abf](https://github.com/mordonez/ldev/commit/e5b0abf3429caa62f3441e04157c1a697275908d))
* **cli:** restore client-secret security tip to portal and resource namespaces ([e548506](https://github.com/mordonez/ldev/commit/e548506aa9219923099dc56f7a3dab61595717c5))
* **inventory:** resolve display page ddm templates from page definitions ([5a514e3](https://github.com/mordonez/ldev/commit/5a514e35542ee39e1b46379ce34eeb4e3637d3fa))
* **issue-engineering:** update screenshot commands to use full-page captures ([3b36fa9](https://github.com/mordonez/ldev/commit/3b36fa97e45361d553fbaa706443b3bc9ee8fea6))
* **oauth:** include admin content read in default scopes ([a8b461a](https://github.com/mordonez/ldev/commit/a8b461a54bc06806dbfdb5685e4681ed02084e33))
* **oauth:** normalize command field to 'ldev:oauthInstall' in install result ([a6e4d7e](https://github.com/mordonez/ldev/commit/a6e4d7ebeae9afa71a48b55985ab51eae610996b))
* **oauth:** pass scope aliases explicitly during install ([8760163](https://github.com/mordonez/ldev/commit/8760163f0c7d73defd44feabc8a8447791ad26cb))
* **worktree:** remove explicit base ref from setup command ([ee0e8b3](https://github.com/mordonez/ldev/commit/ee0e8b31f23c7fd7a6adbad8de5e014ec7756b66))

## [0.5.0](https://github.com/mordonez/ldev/compare/ldev-v0.4.0...ldev-v0.5.0) (2026-04-20)


### Features

* **cli:** harden remote liferay overrides and document remote oauth manual flow ([74b0deb](https://github.com/mordonez/ldev/commit/74b0deb18a8f3a502debc45917a7b5f93f52d260))
* **contracts:** add Zod surface contracts and schema verification ([62c2165](https://github.com/mordonez/ldev/commit/62c2165bbb856a866eb2abbc739fb7f62fe34a61))
* **gateway:** add deleteJson method to LiferayGateway ([ce3a18a](https://github.com/mordonez/ldev/commit/ce3a18a90e3f19a12fa9820de1b71607908a6e31))
* **gateway:** add deleteJson method to LiferayGateway ([2d0e2a0](https://github.com/mordonez/ldev/commit/2d0e2a0d877274fb29d5a5e79b84e9ab04b81a75))
* **inventory:** add --all-sites for structures with optional templates ([7ba9ae9](https://github.com/mordonez/ldev/commit/7ba9ae9d0feac916c58e92fccfe34b62e6817851))
* **inventory:** add --with-templates to structures listing ([3e0982c](https://github.com/mordonez/ldev/commit/3e0982ca501cf10534b5807f3410943a6a61bed1))
* **inventory:** unificar salida structures con contexto de sitio ([34ef184](https://github.com/mordonez/ldev/commit/34ef1842f95019ac7eb9872d7915e5923c34e29e))
* **liferay:** add sanitized error factory and integrate key commands ([4d35e63](https://github.com/mordonez/ldev/commit/4d35e633ffb16a95426d3276870a8b2abed805c7))
* **resource:** add reasonBreakdown to structure sync format output and test fixtures ([d06c99a](https://github.com/mordonez/ldev/commit/d06c99a1aaac43223601a6a0f736a4f63cd22c03))
* **resource:** add shared identifier matchers and unify id/key/name/erc resolution (R11) ([3891ab7](https://github.com/mordonez/ldev/commit/3891ab7eda93280c048d8637d6195a098b620c89))
* **resource:** add shared identifier matchers and unify id/key/name/erc resolution (R11) ([419d313](https://github.com/mordonez/ldev/commit/419d313c442f91bd72e629e67534ff543e1d87d3))
* **resource:** add typed LocalizedMap and makeLocalizedMap helper with lazy serialization (R10) ([51cd236](https://github.com/mordonez/ldev/commit/51cd23618590f8b48310e4f23e7fc68053e7a7e0))
* **resource:** add typed LocalizedMap and makeLocalizedMap helper with lazy serialization (R10) ([779ad24](https://github.com/mordonez/ldev/commit/779ad24ffd170aef7bbc0e830caa5f7426e5563f))
* **resource:** improve migration progress UX and harden structure sync flows ([5e55ff2](https://github.com/mordonez/ldev/commit/5e55ff25192ab48ecf22afc67a2f913781764ac5))
* **resource:** improve migration progress UX and harden structure sync flows ([d7b178f](https://github.com/mordonez/ldev/commit/d7b178f6bb8f9b4b3878034e996da8280439d857))


### Bug Fixes

* add assignOptionalFiniteNumber utility and update priority assignment in inventory page ([c282d83](https://github.com/mordonez/ldev/commit/c282d8321e0106a3a63701c772e63b908de68e58))
* add Liferay inventory page schema and validation ([5eca224](https://github.com/mordonez/ldev/commit/5eca224fd3d0b87108b5c123b8276430ef50cada))
* agents use ldev correctly ([272f66c](https://github.com/mordonez/ldev/commit/272f66c0ce51f9cf555ed97450484f7f6c08db19))
* **ai-install:** normalize relative paths across platforms ([992acd0](https://github.com/mordonez/ldev/commit/992acd0eadaf847bd70955999227d7e2dc9ac14f))
* **contracts:** align fragment sync schema discrimination ([34270cf](https://github.com/mordonez/ldev/commit/34270cfdc670731a330d4f81f3711c7f71289f97))
* **errors:** replace throw new Error with CliError across src ([9b23dee](https://github.com/mordonez/ldev/commit/9b23dee57ec49ed8ea8582087bb45b29e7e86f87))
* **errors:** replace throw new Error with CliError across src ([cd64e2c](https://github.com/mordonez/ldev/commit/cd64e2c8a13733b0f23fbc3f257c7f19e69c6002))
* **liferay:** complete preflight integration and harden lookup caches ([56e2e86](https://github.com/mordonez/ldev/commit/56e2e86d0afe64e85cf1a8508cf117c6d4c7ecc1))
* **liferay:** complete R12/R18 cache hardening and preflight flag integration ([e64bf67](https://github.com/mordonez/ldev/commit/e64bf67b9dcf45805e9b4ac7e5ec488b34eb45d0))
* **resource:** avoid creating empty fragment export dirs for sites without fragments ([f24d63b](https://github.com/mordonez/ldev/commit/f24d63bf8d5ace1e0283a8883eb0bb3a4d5e4c8a))
* **resource:** avoid false timeout recovery when structure shape is unchanged ([697464f](https://github.com/mordonez/ldev/commit/697464f698ca16be57cc25a43a349df004d19766))
* **resource:** harden payload coercion and normalize fragment create/update responses ([8959cad](https://github.com/mordonez/ldev/commit/8959cade21ca4a678159fcafbb8563f760651fb3))
* **resource:** include title_i18n in localized structure migration updates ([6d69e42](https://github.com/mordonez/ldev/commit/6d69e42b5a5673870a3bdeb6106caef5f895b630))
* **resource:** normalize ambiguous artifact error messages to English ([b0deddc](https://github.com/mordonez/ldev/commit/b0deddc9114ef21a4dec686c6f579d04bb1edaf6))
* **resource:** normalize ambiguous artifact error messages to English ([836c34f](https://github.com/mordonez/ldev/commit/836c34f4dafa040d21696d8159de150198fb1f5d))
* **resource:** replace stale command references in error messages and docs ([cbfca15](https://github.com/mordonez/ldev/commit/cbfca15649b705a74705b5e845f485aa043974de))
* **resource:** replace stale get-structure command references in errors and docs ([2d4d765](https://github.com/mordonez/ldev/commit/2d4d76546412787d52eb1f48641d80c65e4393e4))
* **review:** address PR [#102](https://github.com/mordonez/ldev/issues/102) code review findings ([bc32980](https://github.com/mordonez/ldev/commit/bc3298024f2cfdec77041ca95aadf4cf6bc6c01f))

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
