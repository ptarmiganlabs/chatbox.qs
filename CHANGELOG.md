# Changelog

## [0.6.0](https://github.com/ptarmiganlabs/chatbox.qs/compare/chatbox-qs-v0.5.1...chatbox-qs-v0.6.0) (2026-09-17)


### Features

* add a From → To conversation model ([e8ba3d6](https://github.com/ptarmiganlabs/chatbox.qs/commit/e8ba3d6002b8df2c8d870c8346b51328660339d9))
* chatbox.qs — chat-style visualization extension for Qlik Sense ([6232d82](https://github.com/ptarmiganlabs/chatbox.qs/commit/6232d8268ea16289190b538bf2c19e2d39c76cb3))
* choose conversations side by side in the property panel ([ad31ef0](https://github.com/ptarmiganlabs/chatbox.qs/commit/ad31ef091c03bcafab863ced282f8ece27989958))
* choose message kind chips in the property panel ([3f3a909](https://github.com/ptarmiganlabs/chatbox.qs/commit/3f3a9097af2a0ec23d4416d5162e0cc5f5575e5c))
* choose the highlight and category fields in the property panel ([89928e1](https://github.com/ptarmiganlabs/chatbox.qs/commit/89928e10ec1fd9a4424d2955efad7d23205ba0f0))
* collapse rows that belong to one message into one bubble ([1f8d322](https://github.com/ptarmiganlabs/chatbox.qs/commit/1f8d32209aa9101485ee4daac7267404aa274cb7))
* copy the conversation as text or JSON from the context menu ([000f5af](https://github.com/ptarmiganlabs/chatbox.qs/commit/000f5afc8e0f45ca3ef53200c991029298cfd0f3))
* highlight a field's values in messages, coloured by category ([d76f282](https://github.com/ptarmiganlabs/chatbox.qs/commit/d76f2829140b6e8a1d54b3498a92fefb946ce562))
* highlight values in markdown messages ([2d6a422](https://github.com/ptarmiganlabs/chatbox.qs/commit/2d6a422a12654c59cda37f6ce30df17d7f10c402))
* keyboard navigation with a roving tabindex ([2286043](https://github.com/ptarmiganlabs/chatbox.qs/commit/228604363df8e5438b392ca89fdcda02dfd088ea))
* let readers select and copy message text ([64bdc99](https://github.com/ptarmiganlabs/chatbox.qs/commit/64bdc9976d24641f863f9dc455776b70629583ed))
* let search, the ruler and copying follow conversations side by side ([da92421](https://github.com/ptarmiganlabs/chatbox.qs/commit/da924217dacd4928b01a9cc99a4bc494a9461262))
* line conversations up in time with linked scrolling ([c9854ac](https://github.com/ptarmiganlabs/chatbox.qs/commit/c9854acf9e237cfcf46c655be2b537918aa3bcaa))
* match field values and search text with a matcher built once ([66c8be6](https://github.com/ptarmiganlabs/chatbox.qs/commit/66c8be657b01dd002aca01d87284614f91d3c743))
* optional markdown message bodies ([333bda5](https://github.com/ptarmiganlabs/chatbox.qs/commit/333bda57ccfbf33bcdda8c318bb340fe9e9fb358))
* per-message detail reveal with KPIs and sparklines ([54ce150](https://github.com/ptarmiganlabs/chatbox.qs/commit/54ce150bd6d3d38776ca4b184c91a4e5299279a8))
* per-message detail reveal with KPIs and sparklines ([e9c4e5a](https://github.com/ptarmiganlabs/chatbox.qs/commit/e9c4e5a54f6adc0ee306f3f701e6ba89d853b619))
* read a highlight field's values and categories beside the conversation ([c8216bb](https://github.com/ptarmiganlabs/chatbox.qs/commit/c8216bbad9299204cf947e4bd21eb8c23e45692e))
* read a message's kinds as a list of values ([d969887](https://github.com/ptarmiganlabs/chatbox.qs/commit/d969887aff2fad7f89c62a4f2d4dafd78ad1289e))
* resolve two-sided alignment per conversation ([2050136](https://github.com/ptarmiganlabs/chatbox.qs/commit/205013698582c4914f4628cbd545efc5cb2a1fcd))
* say in the JSON copy how many rows were read and which the limit kept ([2461181](https://github.com/ptarmiganlabs/chatbox.qs/commit/24611818496c129a280a0dba726d52db4f1da461)), closes [#45](https://github.com/ptarmiganlabs/chatbox.qs/issues/45)
* search the shown messages and step through the matches ([f9d846f](https://github.com/ptarmiganlabs/chatbox.qs/commit/f9d846fbdb33de147d856f66c95ff9d8fb77a145))
* select the recipient or the whole conversation on click ([c5e77c8](https://github.com/ptarmiganlabs/chatbox.qs/commit/c5e77c87cdbaf10c28b7d8b48d18dd31143afb5f))
* select values and categories by clicking highlights and chips ([dac94bf](https://github.com/ptarmiganlabs/chatbox.qs/commit/dac94bfa1d404854f29f2e8535f41bab4bf31692))
* show conversations side by side, each lane scrolling freely ([649697c](https://github.com/ptarmiganlabs/chatbox.qs/commit/649697c0a5bbf711695a4501e6bc74fc73b3229e))
* show message kinds as chips above the text ([92d82e9](https://github.com/ptarmiganlabs/chatbox.qs/commit/92d82e9d1066915e13e9ae845f0b46676fac3d1f))
* snapshot and export support ([a7d91df](https://github.com/ptarmiganlabs/chatbox.qs/commit/a7d91df4aa17c48c6fad088236f5ca09ca329d0a))
* step through highlights with F3 and an overview ruler ([47201d7](https://github.com/ptarmiganlabs/chatbox.qs/commit/47201d7ebb5292460063295ba1c7b4b58f8c82b4))
* sticky date separators and density modes ([dded320](https://github.com/ptarmiganlabs/chatbox.qs/commit/dded3206e9e926c4bbc020c2a61ca4ccb73120a2))
* sticky date separators and density modes ([e65402f](https://github.com/ptarmiganlabs/chatbox.qs/commit/e65402fe3e272aaebadd6b29c595f15377ad5646))
* work out which conversations go side by side, and in what order ([2ac89c6](https://github.com/ptarmiganlabs/chatbox.qs/commit/2ac89c6e922ba98c34f5eb3963f6cddfb3bd003f))


### Bug Fixes

* **ci:** stop format:check failing on every release PR ([aa58b6a](https://github.com/ptarmiganlabs/chatbox.qs/commit/aa58b6a47e11e6f96e3338b96285091b1819aa9d))
* **ci:** stop format:check failing on every release pull request ([76b9394](https://github.com/ptarmiganlabs/chatbox.qs/commit/76b9394cecce5b644d68433b36e36043278afd67))
* clear a metadata expression when its last field is cleared ([a225dd6](https://github.com/ptarmiganlabs/chatbox.qs/commit/a225dd6b0c67771d72809cc283f03b1bc6b72a7a))
* close four gaps found reviewing the From → To model ([e4b170e](https://github.com/ptarmiganlabs/chatbox.qs/commit/e4b170e3a27118c0286afa487790c7d2b0571382))
* copy a metadata formula typed with = instead of its result ([4754bda](https://github.com/ptarmiganlabs/chatbox.qs/commit/4754bda322753967470c3502c39d917337cd592e))
* drop the colour expression warning once the expression is fixed ([55dbf20](https://github.com/ptarmiganlabs/chatbox.qs/commit/55dbf2054e9cbe4443d907f47c914e8fb0e647ae))
* explain merged bubbles, and dim alternative-state values ([451e1ca](https://github.com/ptarmiganlabs/chatbox.qs/commit/451e1cac14c8a9827d849d46e8a3261433b36702))
* explain merged bubbles, and dim alternative-state values ([bb3030d](https://github.com/ptarmiganlabs/chatbox.qs/commit/bb3030da9f7c934a72405b329f02c13997a8735e))
* keep each message under the day the data holds, in every time zone ([245a93f](https://github.com/ptarmiganlabs/chatbox.qs/commit/245a93f5227e4c91c4b2f1e9ad6a84a1d387d01c))
* keep keyboard focus on its message when the messages shown change ([e6575e0](https://github.com/ptarmiganlabs/chatbox.qs/commit/e6575e027d5a09a583b2cbf748399851f0ff42ba))
* keep messages sent far apart out of one linked row ([1fd9f6b](https://github.com/ptarmiganlabs/chatbox.qs/commit/1fd9f6b80d067b7b9baa16e5b0d9e064d0f4bea8))
* keep the conversation and its lanes while nothing they come from changed ([1c8eb79](https://github.com/ptarmiganlabs/chatbox.qs/commit/1c8eb79eb40cf804fb78f6974109a10b65202488))
* keep the conversation on screen while it reloads after a selection ([c2bfd6f](https://github.com/ptarmiganlabs/chatbox.qs/commit/c2bfd6fea1c0d8e7935d8fefd39f92c6734830f7))
* keep the newest messages when Newest first or lanes meet the limit ([33e6168](https://github.com/ptarmiganlabs/chatbox.qs/commit/33e61689362866a77c3ae1e3ff9af05e30d9e964))
* keep the positional role fallback off columns another role owns ([0ede5a4](https://github.com/ptarmiganlabs/chatbox.qs/commit/0ede5a471978d0fcae3ac010c0902343a3cda354))
* keep the reader's place when a cleared selection brings messages back ([3523380](https://github.com/ptarmiganlabs/chatbox.qs/commit/35233806864927b2244ceca38c1b75b30af7b13e))
* keep Today and Yesterday in an export or a story as the reader saw them ([d7c7ca6](https://github.com/ptarmiganlabs/chatbox.qs/commit/d7c7ca652e3b6312183a14652d55afbd7eb43c49))
* put a message on the right when Own message is Qlik's true ([a9ea674](https://github.com/ptarmiganlabs/chatbox.qs/commit/a9ea674a1b9d5c328f5684b90c6d9695fd535547))
* put messages in time order when Timestamp (numeric) is set ([3c6464a](https://github.com/ptarmiganlabs/chatbox.qs/commit/3c6464ae8418bd472cd663bdc1266342d0a1ed7f))
* read a timestamp in Unix seconds as the moment it is ([6536283](https://github.com/ptarmiganlabs/chatbox.qs/commit/653628386dd73dbd4cb2c85224e1b70dcaca3116))
* read past the phantom rows at the end when reading the newest rows ([ba51892](https://github.com/ptarmiganlabs/chatbox.qs/commit/ba518922d206ff2ea20c4b1d25c0bd4900bb8ee1)), closes [#44](https://github.com/ptarmiganlabs/chatbox.qs/issues/44)
* return to the message at the top of the view after a selection ([7d3be9d](https://github.com/ptarmiganlabs/chatbox.qs/commit/7d3be9d22b9354b27fc9aca72bf4768b1a6b8d4a))
* round the Qlik day-serial conversion to whole milliseconds ([b0387d5](https://github.com/ptarmiganlabs/chatbox.qs/commit/b0387d5d612d176fd13b76b388b9c5b8f6770563))
* say in the panel that messages follow the Message ID, not the timestamp ([0c631a6](https://github.com/ptarmiganlabs/chatbox.qs/commit/0c631a6bb3ad0d26bc3cc5d78218a819eeba4ab3))
* say the lanes come from the rows read whenever rows were cut short ([76dc8df](https://github.com/ptarmiganlabs/chatbox.qs/commit/76dc8df45c34b8ce56eda4e5df3522ed697476b4))
* say where the message limit cut the rows, at either end ([6edd28b](https://github.com/ptarmiganlabs/chatbox.qs/commit/6edd28bea6c220b54340a2d58dc30558a9958aa9))
* say which day each part of a copied transcript is from ([f772aa4](https://github.com/ptarmiganlabs/chatbox.qs/commit/f772aa4d84d0998ea272ced850137e17f4729354))
* say Yesterday on the days the clocks change ([6388c45](https://github.com/ptarmiganlabs/chatbox.qs/commit/6388c455abb39ad8a192953c9908f424831d93fb))
* skip phantom rows that linked tables add to the cube ([3abfb30](https://github.com/ptarmiganlabs/chatbox.qs/commit/3abfb3055815a5dc58c1fef91b1721718d18fa9b))
* stop redoing day headers over lanes and holding on to gone lanes ([5d7e2e5](https://github.com/ptarmiganlabs/chatbox.qs/commit/5d7e2e5c157b19e53f9b857d03bcd36377ed6b5f))
* write a Qlik timestamp's time in the JSON copy without a Z ([37f2e95](https://github.com/ptarmiganlabs/chatbox.qs/commit/37f2e9504bb61a165dc6146a89f6dab9a738eda8))


### Miscellaneous

* characterise the hypercube data targets ([4847d63](https://github.com/ptarmiganlabs/chatbox.qs/commit/4847d63aed60075189e946086cd1266d7c9e2794))
* **deps-dev:** Bump eslint-plugin-jsdoc from 63.3.3 to 64.3.4 ([287bcaf](https://github.com/ptarmiganlabs/chatbox.qs/commit/287bcaf5efbc760f19af13fa644004771872e39a))
* **deps-dev:** Bump eslint-plugin-jsdoc from 63.3.3 to 64.3.4 ([89fd970](https://github.com/ptarmiganlabs/chatbox.qs/commit/89fd970ffdf26e3d6a30d83a2f6a2de02ce28752))
* **deps-dev:** Bump jsdom from 29.1.1 to 30.0.1 ([bf5badb](https://github.com/ptarmiganlabs/chatbox.qs/commit/bf5badba6e1ff15c2b6ef673037a58a44f9320f5))
* **deps-dev:** Bump jsdom from 29.1.1 to 30.0.1 ([5560f48](https://github.com/ptarmiganlabs/chatbox.qs/commit/5560f4839faadca60c401b327f2b685b270981ac))
* **deps:** Bump actions/checkout from 6.0.2 to 7.0.1 ([82bc6b4](https://github.com/ptarmiganlabs/chatbox.qs/commit/82bc6b428580cb0083a8df8411f6e970eac01004))
* **deps:** Bump actions/checkout from 6.0.2 to 7.0.1 ([ee74424](https://github.com/ptarmiganlabs/chatbox.qs/commit/ee74424b1aeb435e492097c4d6ad70b091ea299a))
* **deps:** Bump actions/setup-node from 6.4.0 to 7.0.0 ([8362d1f](https://github.com/ptarmiganlabs/chatbox.qs/commit/8362d1f7ad4535c07e05cd15d592360fc9eb61c3))
* **deps:** Bump actions/setup-node from 6.4.0 to 7.0.0 ([79965fd](https://github.com/ptarmiganlabs/chatbox.qs/commit/79965fd338106f6b11f481d61c718fec816546e7))
* **deps:** Bump astral-sh/setup-uv from 8.1.0 to 10.0.1 ([3b371e1](https://github.com/ptarmiganlabs/chatbox.qs/commit/3b371e14e176de2eee8ebdf1aeb560ac6372aad8))
* **deps:** Bump astral-sh/setup-uv from 8.1.0 to 10.0.1 ([36d5bdb](https://github.com/ptarmiganlabs/chatbox.qs/commit/36d5bdb3a5968d61af5be9fa75a4f5d856d168bd))
* **deps:** bump github/codeql-action to 4.37.9 across all steps ([0131387](https://github.com/ptarmiganlabs/chatbox.qs/commit/0131387b0a26b889d87a1b78b484c238eea74418))
* **main:** release chatbox-qs 0.2.0 ([8187b43](https://github.com/ptarmiganlabs/chatbox.qs/commit/8187b43ebf89578e1cc34d290bd92d2d279fd33b))
* **main:** release chatbox-qs 0.2.0 ([4fff866](https://github.com/ptarmiganlabs/chatbox.qs/commit/4fff866f7af9909c26402fbdb78993f4b9c33fa2))
* **main:** release chatbox-qs 0.3.0 ([d048ed0](https://github.com/ptarmiganlabs/chatbox.qs/commit/d048ed094d0a2283a9900776150f805a27cdb3e6))
* **main:** release chatbox-qs 0.3.0 ([5c5c00a](https://github.com/ptarmiganlabs/chatbox.qs/commit/5c5c00a31ccc1bf4743439461b5c23c02287ec2f))
* **main:** release chatbox-qs 0.4.0 ([51d5dbc](https://github.com/ptarmiganlabs/chatbox.qs/commit/51d5dbc6e096a69a101ea7ab546d50e408954d14))
* **main:** release chatbox-qs 0.4.0 ([c3ed07a](https://github.com/ptarmiganlabs/chatbox.qs/commit/c3ed07a2bc3ecd0a6d4dbece71bc477fb4dc367a))
* **main:** release chatbox-qs 0.5.0 ([5b79428](https://github.com/ptarmiganlabs/chatbox.qs/commit/5b79428d257be017dae5b3c108d10d5e7fe929cb))
* **main:** release chatbox-qs 0.5.0 ([50a9a8a](https://github.com/ptarmiganlabs/chatbox.qs/commit/50a9a8a887b65ffad0a15034ace44c57c286efbf))
* **main:** release chatbox-qs 0.5.1 ([72b1d23](https://github.com/ptarmiganlabs/chatbox.qs/commit/72b1d2346259b9c613c212efe58ad62dd6334e8c))
* **main:** release chatbox-qs 0.5.1 ([a44b2b5](https://github.com/ptarmiganlabs/chatbox.qs/commit/a44b2b5cb192d28eb4341e1665a69f3fcd1cf85c))
* time scale ratios by the fastest of several runs ([3b36918](https://github.com/ptarmiganlabs/chatbox.qs/commit/3b36918668ec3402442ad94ce1ed9c2f3a8d2d91))


### Refactoring

* give the message list and its reader's place a component of its own ([1491440](https://github.com/ptarmiganlabs/chatbox.qs/commit/14914401d40191ea7dac367409a0a36db2c74ebf))
* move the reader's-place helpers out of ChatLog ([6e358b3](https://github.com/ptarmiganlabs/chatbox.qs/commit/6e358b37328b25e625f1aa03cdd5770dcb55df30))
* share one theme palette between participants and categories ([f5a49fb](https://github.com/ptarmiganlabs/chatbox.qs/commit/f5a49fbbdee5036f258d0cbb0da31ec1d5a10274))


### Documentation

* describe conversations side by side ([807858f](https://github.com/ptarmiganlabs/chatbox.qs/commit/807858f5f7c4f0c01d1be7bb5fdccf2c6239541d))
* describe highlighting, categories, search, stepping and copying ([11ce7f4](https://github.com/ptarmiganlabs/chatbox.qs/commit/11ce7f48f16781861776e012e2c8a942593e3ba6))
* describe message kind chips ([78c39a5](https://github.com/ptarmiganlabs/chatbox.qs/commit/78c39a58040ab6e63adaaec0e714869fa111cdc7))
* describe the summary at the top of the JSON copy ([b96d342](https://github.com/ptarmiganlabs/chatbox.qs/commit/b96d34286ccce0791e0c85504a5426a1ce5dc50e))
* describe Unix seconds, Qlik's true, = in metadata and message order ([c375097](https://github.com/ptarmiganlabs/chatbox.qs/commit/c375097dd9a04677cf150c7612d42f812cc7acb1))
* note that the May 2026 server re-validates on island selections ([985426e](https://github.com/ptarmiganlabs/chatbox.qs/commit/985426eca811a4ce81cf6fb95c1957faa446e18b))
* say that exports and stories keep Today and Yesterday ([11d9c7b](https://github.com/ptarmiganlabs/chatbox.qs/commit/11d9c7b4f90e0121663b9ec663f26735d89b5485))
* say that messages follow the timestamp, and how the sort is applied ([332367c](https://github.com/ptarmiganlabs/chatbox.qs/commit/332367c01181e786f40395722d1c493077756032))
* say that phantom rows no longer take the newest messages' places ([d20e801](https://github.com/ptarmiganlabs/chatbox.qs/commit/d20e8016184800bd4e2212c790e6d6fd9afba537))
* say that the JSON copy's time has no zone in schema 2 ([d0ebb2e](https://github.com/ptarmiganlabs/chatbox.qs/commit/d0ebb2e3dcf4c89d7009e964188127b61a1212c5))
* say which day a message is shown under, and what the JSON time means ([e822466](https://github.com/ptarmiganlabs/chatbox.qs/commit/e8224666379ca3ee585567fb5a84fa053f329bc5))
* say which rows Maximum messages keeps ([f2b4090](https://github.com/ptarmiganlabs/chatbox.qs/commit/f2b40906c37514ae941aa37bbb70e90ebe24f285))

## [0.5.1](https://github.com/ptarmiganlabs/chatbox.qs/compare/chatbox-qs-v0.5.0...chatbox-qs-v0.5.1) (2026-09-17)


### Bug Fixes

* clear a metadata expression when its last field is cleared ([a225dd6](https://github.com/ptarmiganlabs/chatbox.qs/commit/a225dd6b0c67771d72809cc283f03b1bc6b72a7a))
* copy a metadata formula typed with = instead of its result ([4754bda](https://github.com/ptarmiganlabs/chatbox.qs/commit/4754bda322753967470c3502c39d917337cd592e))
* put a message on the right when Own message is Qlik's true ([a9ea674](https://github.com/ptarmiganlabs/chatbox.qs/commit/a9ea674a1b9d5c328f5684b90c6d9695fd535547))
* put messages in time order when Timestamp (numeric) is set ([3c6464a](https://github.com/ptarmiganlabs/chatbox.qs/commit/3c6464ae8418bd472cd663bdc1266342d0a1ed7f))
* read a timestamp in Unix seconds as the moment it is ([6536283](https://github.com/ptarmiganlabs/chatbox.qs/commit/653628386dd73dbd4cb2c85224e1b70dcaca3116))
* say in the panel that messages follow the Message ID, not the timestamp ([0c631a6](https://github.com/ptarmiganlabs/chatbox.qs/commit/0c631a6bb3ad0d26bc3cc5d78218a819eeba4ab3))


### Documentation

* describe Unix seconds, Qlik's true, = in metadata and message order ([c375097](https://github.com/ptarmiganlabs/chatbox.qs/commit/c375097dd9a04677cf150c7612d42f812cc7acb1))
* say that messages follow the timestamp, and how the sort is applied ([332367c](https://github.com/ptarmiganlabs/chatbox.qs/commit/332367c01181e786f40395722d1c493077756032))

## [0.5.0](https://github.com/ptarmiganlabs/chatbox.qs/compare/chatbox-qs-v0.4.0...chatbox-qs-v0.5.0) (2026-09-17)


### Features

* say in the JSON copy how many rows were read and which the limit kept ([2461181](https://github.com/ptarmiganlabs/chatbox.qs/commit/24611818496c129a280a0dba726d52db4f1da461)), closes [#45](https://github.com/ptarmiganlabs/chatbox.qs/issues/45)


### Bug Fixes

* keep each message under the day the data holds, in every time zone ([245a93f](https://github.com/ptarmiganlabs/chatbox.qs/commit/245a93f5227e4c91c4b2f1e9ad6a84a1d387d01c))
* keep Today and Yesterday in an export or a story as the reader saw them ([d7c7ca6](https://github.com/ptarmiganlabs/chatbox.qs/commit/d7c7ca652e3b6312183a14652d55afbd7eb43c49))
* read past the phantom rows at the end when reading the newest rows ([ba51892](https://github.com/ptarmiganlabs/chatbox.qs/commit/ba518922d206ff2ea20c4b1d25c0bd4900bb8ee1)), closes [#44](https://github.com/ptarmiganlabs/chatbox.qs/issues/44)
* say Yesterday on the days the clocks change ([6388c45](https://github.com/ptarmiganlabs/chatbox.qs/commit/6388c455abb39ad8a192953c9908f424831d93fb))
* write a Qlik timestamp's time in the JSON copy without a Z ([37f2e95](https://github.com/ptarmiganlabs/chatbox.qs/commit/37f2e9504bb61a165dc6146a89f6dab9a738eda8))


### Documentation

* describe the summary at the top of the JSON copy ([b96d342](https://github.com/ptarmiganlabs/chatbox.qs/commit/b96d34286ccce0791e0c85504a5426a1ce5dc50e))
* say that exports and stories keep Today and Yesterday ([11d9c7b](https://github.com/ptarmiganlabs/chatbox.qs/commit/11d9c7b4f90e0121663b9ec663f26735d89b5485))
* say that phantom rows no longer take the newest messages' places ([d20e801](https://github.com/ptarmiganlabs/chatbox.qs/commit/d20e8016184800bd4e2212c790e6d6fd9afba537))
* say that the JSON copy's time has no zone in schema 2 ([d0ebb2e](https://github.com/ptarmiganlabs/chatbox.qs/commit/d0ebb2e3dcf4c89d7009e964188127b61a1212c5))
* say which day a message is shown under, and what the JSON time means ([e822466](https://github.com/ptarmiganlabs/chatbox.qs/commit/e8224666379ca3ee585567fb5a84fa053f329bc5))

## [0.4.0](https://github.com/ptarmiganlabs/chatbox.qs/compare/chatbox-qs-v0.3.0...chatbox-qs-v0.4.0) (2026-09-16)


### Features

* choose conversations side by side in the property panel ([ad31ef0](https://github.com/ptarmiganlabs/chatbox.qs/commit/ad31ef091c03bcafab863ced282f8ece27989958))
* choose message kind chips in the property panel ([3f3a909](https://github.com/ptarmiganlabs/chatbox.qs/commit/3f3a9097af2a0ec23d4416d5162e0cc5f5575e5c))
* choose the highlight and category fields in the property panel ([89928e1](https://github.com/ptarmiganlabs/chatbox.qs/commit/89928e10ec1fd9a4424d2955efad7d23205ba0f0))
* copy the conversation as text or JSON from the context menu ([000f5af](https://github.com/ptarmiganlabs/chatbox.qs/commit/000f5afc8e0f45ca3ef53200c991029298cfd0f3))
* highlight a field's values in messages, coloured by category ([d76f282](https://github.com/ptarmiganlabs/chatbox.qs/commit/d76f2829140b6e8a1d54b3498a92fefb946ce562))
* highlight values in markdown messages ([2d6a422](https://github.com/ptarmiganlabs/chatbox.qs/commit/2d6a422a12654c59cda37f6ce30df17d7f10c402))
* let readers select and copy message text ([64bdc99](https://github.com/ptarmiganlabs/chatbox.qs/commit/64bdc9976d24641f863f9dc455776b70629583ed))
* let search, the ruler and copying follow conversations side by side ([da92421](https://github.com/ptarmiganlabs/chatbox.qs/commit/da924217dacd4928b01a9cc99a4bc494a9461262))
* line conversations up in time with linked scrolling ([c9854ac](https://github.com/ptarmiganlabs/chatbox.qs/commit/c9854acf9e237cfcf46c655be2b537918aa3bcaa))
* match field values and search text with a matcher built once ([66c8be6](https://github.com/ptarmiganlabs/chatbox.qs/commit/66c8be657b01dd002aca01d87284614f91d3c743))
* read a highlight field's values and categories beside the conversation ([c8216bb](https://github.com/ptarmiganlabs/chatbox.qs/commit/c8216bbad9299204cf947e4bd21eb8c23e45692e))
* read a message's kinds as a list of values ([d969887](https://github.com/ptarmiganlabs/chatbox.qs/commit/d969887aff2fad7f89c62a4f2d4dafd78ad1289e))
* search the shown messages and step through the matches ([f9d846f](https://github.com/ptarmiganlabs/chatbox.qs/commit/f9d846fbdb33de147d856f66c95ff9d8fb77a145))
* select values and categories by clicking highlights and chips ([dac94bf](https://github.com/ptarmiganlabs/chatbox.qs/commit/dac94bfa1d404854f29f2e8535f41bab4bf31692))
* show conversations side by side, each lane scrolling freely ([649697c](https://github.com/ptarmiganlabs/chatbox.qs/commit/649697c0a5bbf711695a4501e6bc74fc73b3229e))
* show message kinds as chips above the text ([92d82e9](https://github.com/ptarmiganlabs/chatbox.qs/commit/92d82e9d1066915e13e9ae845f0b46676fac3d1f))
* step through highlights with F3 and an overview ruler ([47201d7](https://github.com/ptarmiganlabs/chatbox.qs/commit/47201d7ebb5292460063295ba1c7b4b58f8c82b4))
* work out which conversations go side by side, and in what order ([2ac89c6](https://github.com/ptarmiganlabs/chatbox.qs/commit/2ac89c6e922ba98c34f5eb3963f6cddfb3bd003f))


### Bug Fixes

* drop the colour expression warning once the expression is fixed ([55dbf20](https://github.com/ptarmiganlabs/chatbox.qs/commit/55dbf2054e9cbe4443d907f47c914e8fb0e647ae))
* keep keyboard focus on its message when the messages shown change ([e6575e0](https://github.com/ptarmiganlabs/chatbox.qs/commit/e6575e027d5a09a583b2cbf748399851f0ff42ba))
* keep messages sent far apart out of one linked row ([1fd9f6b](https://github.com/ptarmiganlabs/chatbox.qs/commit/1fd9f6b80d067b7b9baa16e5b0d9e064d0f4bea8))
* keep the conversation and its lanes while nothing they come from changed ([1c8eb79](https://github.com/ptarmiganlabs/chatbox.qs/commit/1c8eb79eb40cf804fb78f6974109a10b65202488))
* keep the conversation on screen while it reloads after a selection ([c2bfd6f](https://github.com/ptarmiganlabs/chatbox.qs/commit/c2bfd6fea1c0d8e7935d8fefd39f92c6734830f7))
* keep the newest messages when Newest first or lanes meet the limit ([33e6168](https://github.com/ptarmiganlabs/chatbox.qs/commit/33e61689362866a77c3ae1e3ff9af05e30d9e964))
* keep the reader's place when a cleared selection brings messages back ([3523380](https://github.com/ptarmiganlabs/chatbox.qs/commit/35233806864927b2244ceca38c1b75b30af7b13e))
* return to the message at the top of the view after a selection ([7d3be9d](https://github.com/ptarmiganlabs/chatbox.qs/commit/7d3be9d22b9354b27fc9aca72bf4768b1a6b8d4a))
* say the lanes come from the rows read whenever rows were cut short ([76dc8df](https://github.com/ptarmiganlabs/chatbox.qs/commit/76dc8df45c34b8ce56eda4e5df3522ed697476b4))
* say where the message limit cut the rows, at either end ([6edd28b](https://github.com/ptarmiganlabs/chatbox.qs/commit/6edd28bea6c220b54340a2d58dc30558a9958aa9))
* say which day each part of a copied transcript is from ([f772aa4](https://github.com/ptarmiganlabs/chatbox.qs/commit/f772aa4d84d0998ea272ced850137e17f4729354))
* stop redoing day headers over lanes and holding on to gone lanes ([5d7e2e5](https://github.com/ptarmiganlabs/chatbox.qs/commit/5d7e2e5c157b19e53f9b857d03bcd36377ed6b5f))


### Miscellaneous

* time scale ratios by the fastest of several runs ([3b36918](https://github.com/ptarmiganlabs/chatbox.qs/commit/3b36918668ec3402442ad94ce1ed9c2f3a8d2d91))


### Refactoring

* give the message list and its reader's place a component of its own ([1491440](https://github.com/ptarmiganlabs/chatbox.qs/commit/14914401d40191ea7dac367409a0a36db2c74ebf))
* move the reader's-place helpers out of ChatLog ([6e358b3](https://github.com/ptarmiganlabs/chatbox.qs/commit/6e358b37328b25e625f1aa03cdd5770dcb55df30))
* share one theme palette between participants and categories ([f5a49fb](https://github.com/ptarmiganlabs/chatbox.qs/commit/f5a49fbbdee5036f258d0cbb0da31ec1d5a10274))


### Documentation

* describe conversations side by side ([807858f](https://github.com/ptarmiganlabs/chatbox.qs/commit/807858f5f7c4f0c01d1be7bb5fdccf2c6239541d))
* describe highlighting, categories, search, stepping and copying ([11ce7f4](https://github.com/ptarmiganlabs/chatbox.qs/commit/11ce7f48f16781861776e012e2c8a942593e3ba6))
* describe message kind chips ([78c39a5](https://github.com/ptarmiganlabs/chatbox.qs/commit/78c39a58040ab6e63adaaec0e714869fa111cdc7))
* note that the May 2026 server re-validates on island selections ([985426e](https://github.com/ptarmiganlabs/chatbox.qs/commit/985426eca811a4ce81cf6fb95c1957faa446e18b))
* say which rows Maximum messages keeps ([f2b4090](https://github.com/ptarmiganlabs/chatbox.qs/commit/f2b40906c37514ae941aa37bbb70e90ebe24f285))

## [0.3.0](https://github.com/ptarmiganlabs/chatbox.qs/compare/chatbox-qs-v0.2.0...chatbox-qs-v0.3.0) (2026-09-15)


### Features

* add a From → To conversation model ([e8ba3d6](https://github.com/ptarmiganlabs/chatbox.qs/commit/e8ba3d6002b8df2c8d870c8346b51328660339d9))
* collapse rows that belong to one message into one bubble ([1f8d322](https://github.com/ptarmiganlabs/chatbox.qs/commit/1f8d32209aa9101485ee4daac7267404aa274cb7))
* keyboard navigation with a roving tabindex ([2286043](https://github.com/ptarmiganlabs/chatbox.qs/commit/228604363df8e5438b392ca89fdcda02dfd088ea))
* optional markdown message bodies ([333bda5](https://github.com/ptarmiganlabs/chatbox.qs/commit/333bda57ccfbf33bcdda8c318bb340fe9e9fb358))
* resolve two-sided alignment per conversation ([2050136](https://github.com/ptarmiganlabs/chatbox.qs/commit/205013698582c4914f4628cbd545efc5cb2a1fcd))
* select the recipient or the whole conversation on click ([c5e77c8](https://github.com/ptarmiganlabs/chatbox.qs/commit/c5e77c87cdbaf10c28b7d8b48d18dd31143afb5f))
* snapshot and export support ([a7d91df](https://github.com/ptarmiganlabs/chatbox.qs/commit/a7d91df4aa17c48c6fad088236f5ca09ca329d0a))
* sticky date separators and density modes ([dded320](https://github.com/ptarmiganlabs/chatbox.qs/commit/dded3206e9e926c4bbc020c2a61ca4ccb73120a2))


### Bug Fixes

* close four gaps found reviewing the From → To model ([e4b170e](https://github.com/ptarmiganlabs/chatbox.qs/commit/e4b170e3a27118c0286afa487790c7d2b0571382))
* keep the positional role fallback off columns another role owns ([0ede5a4](https://github.com/ptarmiganlabs/chatbox.qs/commit/0ede5a471978d0fcae3ac010c0902343a3cda354))
* round the Qlik day-serial conversion to whole milliseconds ([b0387d5](https://github.com/ptarmiganlabs/chatbox.qs/commit/b0387d5d612d176fd13b76b388b9c5b8f6770563))
* skip phantom rows that linked tables add to the cube ([3abfb30](https://github.com/ptarmiganlabs/chatbox.qs/commit/3abfb3055815a5dc58c1fef91b1721718d18fa9b))


### Miscellaneous

* characterise the hypercube data targets ([4847d63](https://github.com/ptarmiganlabs/chatbox.qs/commit/4847d63aed60075189e946086cd1266d7c9e2794))
* **deps-dev:** Bump eslint-plugin-jsdoc from 63.3.3 to 64.3.4 ([287bcaf](https://github.com/ptarmiganlabs/chatbox.qs/commit/287bcaf5efbc760f19af13fa644004771872e39a))
* **deps-dev:** Bump jsdom from 29.1.1 to 30.0.1 ([bf5badb](https://github.com/ptarmiganlabs/chatbox.qs/commit/bf5badba6e1ff15c2b6ef673037a58a44f9320f5))
* **deps:** Bump actions/checkout from 6.0.2 to 7.0.1 ([82bc6b4](https://github.com/ptarmiganlabs/chatbox.qs/commit/82bc6b428580cb0083a8df8411f6e970eac01004))
* **deps:** Bump actions/setup-node from 6.4.0 to 7.0.0 ([8362d1f](https://github.com/ptarmiganlabs/chatbox.qs/commit/8362d1f7ad4535c07e05cd15d592360fc9eb61c3))
* **deps:** Bump astral-sh/setup-uv from 8.1.0 to 10.0.1 ([3b371e1](https://github.com/ptarmiganlabs/chatbox.qs/commit/3b371e14e176de2eee8ebdf1aeb560ac6372aad8))
* **deps:** bump github/codeql-action to 4.37.9 across all steps ([0131387](https://github.com/ptarmiganlabs/chatbox.qs/commit/0131387b0a26b889d87a1b78b484c238eea74418))

## [0.2.0](https://github.com/ptarmiganlabs/chatbox.qs/compare/chatbox-qs-v0.1.0...chatbox-qs-v0.2.0) (2026-09-10)


### Features

* chatbox.qs — chat-style visualization extension for Qlik Sense ([6232d82](https://github.com/ptarmiganlabs/chatbox.qs/commit/6232d8268ea16289190b538bf2c19e2d39c76cb3))
* per-message detail reveal with KPIs and sparklines ([54ce150](https://github.com/ptarmiganlabs/chatbox.qs/commit/54ce150bd6d3d38776ca4b184c91a4e5299279a8))
* per-message detail reveal with KPIs and sparklines ([e9c4e5a](https://github.com/ptarmiganlabs/chatbox.qs/commit/e9c4e5a54f6adc0ee306f3f701e6ba89d853b619))


### Bug Fixes

* **ci:** stop format:check failing on every release PR ([aa58b6a](https://github.com/ptarmiganlabs/chatbox.qs/commit/aa58b6a47e11e6f96e3338b96285091b1819aa9d))
* **ci:** stop format:check failing on every release pull request ([76b9394](https://github.com/ptarmiganlabs/chatbox.qs/commit/76b9394cecce5b644d68433b36e36043278afd67))
* explain merged bubbles, and dim alternative-state values ([451e1ca](https://github.com/ptarmiganlabs/chatbox.qs/commit/451e1cac14c8a9827d849d46e8a3261433b36702))
* explain merged bubbles, and dim alternative-state values ([bb3030d](https://github.com/ptarmiganlabs/chatbox.qs/commit/bb3030da9f7c934a72405b329f02c13997a8735e))
