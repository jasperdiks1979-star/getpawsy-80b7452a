## [0.2.0](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/compare/v0.1.4...v0.2.0) (2026-06-18)


### Features

* **qa:** caption-aware OCR validator (ignore source-image text) ([5cc6ac9](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/5cc6ac9a25860fc303a31ad6262934c098925b53))

## [1.0.1](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/compare/v1.0.0...v1.0.1) (2026-10-30)


### 🐛 Bug Fixes

* **a11y:** add contrast margin for muted text on primary surfaces ([a8089e1](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/a8089e1560de610a2f9a823276757e02d2cbd08c))
* **a11y:** darken orange brand tokens to meet WCAG AA contrast on light surfaces ([89458b4](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/89458b42931838250769de515ce0add6207ca2ea))
* **a11y:** ensure Klarna PDP text meets WCAG AA contrast ([e780e70](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/e780e701b8b1e18e212313897e21e755bf9885b9))
* **a11y:** increase Klarna checkout label contrast ([a35bd7a](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/a35bd7ab8ef64d14eeb186d283ee61d80701fbf5))
* **a11y:** increase small savings text contrast on product page ([459a11d](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/459a11d5a5c0c3f7e11eb05f788b306399cf9e2a))
* **a11y:** increase small savings text contrast on product page ([48f70dc](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/48f70dc9c188744673e7f520af7f97c2a822755f))
* **boot:** preserve attribution and keep one reload guard across lazy route failures ([30b4193](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/30b419392a46b8da0f5b504c44489386d4905c91))
* **cart:** fail visibly without automatic reload loop when provider is missing ([608aaaf](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/608aaaf6bef8be267ae829fb6cacf704cbff9f03))
* fail visibly when cart provider is unavailable ([150c63b](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/150c63b70fb2d9be70a2e84924fd6982994ac662))
* label cart controls, distinguish contact links and type funnel fixture ([f174366](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/f174366f8c2f4727fd48f9afb2a016510b76f7e8))
* remove competing main entry chunk reload handlers ([96c9fbd](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/96c9fbdd6d874a1f579e05938c4fe1788ffb92b2))
* **routes:** share boot chunk-reload guard and preserve query attribution ([2e0260a](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/2e0260a5234a512a9d8a055d28ea3b47db93c773))


### 📚 Documentation

* format add-to-cart regression test comment ([1809b7f](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/1809b7fa164dd346f3331437fcc349dd618cf5c7))


### ✅ Tests

* **a11y:** await settled reviews fade before contrast audit ([41a7618](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/41a76183b59d64b059d0208b56ce5f14e703a4de))
* **a11y:** wait for PDP breadcrumb fade-in before axe contrast audit ([072cad1](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/072cad1e4c870cd12988e9067bc8659ff69a686d))
* **atc:** correct literal regex escaping in shared cart writer guard ([143adab](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/143adab8a3851fec6fae2e92d70985d85c20fb13))
* **boot:** protect unified reload guard and preserved marketing parameters ([ea2020a](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/ea2020a23bca587e693f756ac2936e808f98cf17))
* **cart:** expose stable upsell visual hook ([694322f](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/694322fcef79567ee3bf1b179f0d84de5cee2af5))
* **cart:** guard against silently inert cart outside provider ([a4ac7b7](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/a4ac7b7d640f663dbe5b988686ebd4cccb02348f))
* **checkout:** assert empty-cart state across supported storefront variants ([17fa50e](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/17fa50ede27c500690ce62c80913f40462d5113a))
* **e2e:** inject missing entry chunks and verify bounded recovery with UTM preservation ([859f590](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/859f590d7e754840e283cca6d0ac1fa5c097d0a5))
* fail closed on missing visual baselines and isolate checkout journeys ([02d1cc5](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/02d1cc5dc8c628b25f473843b6430bdd082ac537))
* **preview:** load hosted category assets on localhost ([03b6630](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/03b663046676c8ba0fddfd14e746c17dc25e1055))
* scope analytics funnel beacon assertions to CCI endpoint ([1d07041](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/1d070411a741089c7e8213f94e01ad2cc4c01811))
* verify shared CartContext add-to-cart success without PDP duplication ([cca6beb](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/cca6beb3e675e97d3d9a0c9b9179de359f482905))
* **visual:** add reviewed baseline snapshots ([6a04fef](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/6a04fef5a31e38885a74006325b47f593e44d3a3))
* **visual:** exclude localhost consent controls from baselines ([3bb5481](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/3bb548189cd890d457c6be477feb92bba627929b))
* **visual:** mask complete dynamic cart upsells ([a6de006](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/a6de00675b3ba2bea9cc371585ae8c3095ffa5c3))
* **visual:** mask dynamic cart cross-sells in baseline ([793da52](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/793da52dea963131203c6b4d6c43544d9bdcf760))
* **visual:** refresh deterministic cart baseline ([8016b6d](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/8016b6d86d174474451dced6beb82f70e88f0092))
* **visual:** refresh fully masked cart baseline ([d00d06c](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/d00d06c4a508c7792e2e9f44fb7923dcc090f22f))
* **visual:** scope cart add action to primary PDP buy box ([98c7104](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/98c7104e19737e8dc9c636be3fd3d1a92a5eacf3))


### 👷 CI/CD

* budget split JS chunks against baseline and per-chunk size ([5dadf2c](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/5dadf2c516ec1bd2ad31d4c56129c3dedd0ce655))
* **bundle:** build nested base checkout with Vite instead of root-relative test script ([3710911](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/3710911d24a02cc18dc998821e6cf02ff9e17ef1))
* **e2e:** run entry-chunk fault injection alongside checkout browser tests ([9397628](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/93976288ebe0e004fba365a25333131d725cf129))
* **visual:** add one-time baseline importer ([5108e05](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/5108e05065419c3ee45eeaf421724b651857a1fd))
* **visual:** bootstrap reviewed baselines once ([d184761](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/d1847615eff1dd997dcb6a97701d837299849405))
* **visual:** bootstrap snapshot files without workflow push ([6dcb1e5](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/6dcb1e59a353b6f304cdc42dc1d5a84b515d49a3))
* **visual:** commit baselines onto PR head safely ([e2fea4a](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/e2fea4a240feb44a12266749972c2ac6639f77ac))
* **visual:** import reviewed fully masked cart baseline ([7c88ca9](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/7c88ca9aea04942c30645ee2a5c97283bb523c1c))
* **visual:** refresh masked cart baseline once ([feec90b](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/feec90bfcb6e5ec430285096be0f3b9f13b4deee))
* **visual:** remove one-time baseline importer ([0302a6a](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/0302a6a657d4a6bef534e2049f6034c9b917cf88))
* **visual:** remove one-time cart baseline importer ([9bcaae5](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/9bcaae57ec634e937e44ede5c0d4a3d6fce6fbb6))
* **visual:** restore fail-closed regression gate ([3fdbd7d](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/3fdbd7d04303361c3ab37726570617d0ffcbbd51))
* **visual:** restore final fail-closed regression gate ([90baaff](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/90baaffdce954da9b1ac56d55d2082c964367d1b))
* **visual:** restore permanent fail-closed baseline check ([264aa04](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/264aa047de912be0f2d9691fd7e19937a6de9a60))

## [0.1.4](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/compare/v0.1.3...v0.1.4) (2026-06-18)


### Bug Fixes

* OCR filter — only flag substantive alphabetic caption tokens, ignore product-image labels ([f02ddd1](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/f02ddd17006d68e4656867070a669cf75c3278b7))

## [0.1.3](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/compare/v0.1.2...v0.1.3) (2026-06-18)


### Bug Fixes

* drawtext descender 50%, QA margin=0 (no double-buffer) ([35f7a00](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/35f7a00cc7c5160c1d118aa4951ada76217a149b))

## [0.1.2](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/compare/v0.1.1...v0.1.2) (2026-06-18)


### Bug Fixes

* descender-aware caption margin (40+30% fontsize) ([452da3c](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/452da3c9865c7c76563de1f344725214363ac7ed))

## [0.1.1](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/compare/v0.1.0...v0.1.1) (2026-06-18)


### Bug Fixes

* QA OCR column indices (use top/height not left/width) + 40px safe margin ([ea43750](https://github.com/jasperdiks1979-star/getpawsy-80b7452a/commit/ea43750a8a176fc2aa34e370da8818d6978896fc))
