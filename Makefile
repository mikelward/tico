# Every test file runs from here. `make test` fails if a *_test.js under
# src/ isn't listed, since an unlisted test never runs.
TESTS = \
	src/apps_test.js \
	src/calendar_test.js \
	src/clocks_test.js \
	src/dim_test.js \
	src/geometry_test.js \
	src/keys_test.js \
	src/launcher_test.js \
	src/restart_test.js \
	src/settings_test.js \
	src/setup_test.js \
	src/unread_test.js \
	src/watchers_test.js \
	src/workspaces_test.js \
	src/tico_test.js \
	src/manifest_test.js \
	src/package_test.js

.PHONY: test lint smoke icons zip
test:
	@unlisted=$$(find src -name '*_test.js' | sort | while read -r f; do \
		case " $(TESTS) " in *" $$f "*) ;; *) echo "$$f";; esac; done); \
	if test -n "$$unlisted"; then echo "not in the Makefile's TESTS: $$unlisted" >&2; exit 1; fi
	node --test $(TESTS)

# Every script parses, including the pages' own, which no test imports.
lint:
	@for f in src/*.js test/*.js scripts/*.js; do node --check "$$f" || exit 1; done

# Needs `npm ci` and Playwright's Chromium (`npx playwright install chromium`).
smoke:
	node --test test/smoke.js

# The PNG icons from icons/tico.svg; needs what `make smoke` needs.
icons:
	node scripts/render-icons.js

# The Chrome Web Store upload: manifest.json at the top, and nothing only
# development needs. DIST picks where it goes.
DIST ?= dist
VERSION := $(shell node -p "require('./manifest.json').version")
zip:
	mkdir -p $(DIST)
	rm -f $(DIST)/tico-$(VERSION).zip
	zip -qrX $(DIST)/tico-$(VERSION).zip manifest.json src icons/*.png \
		-x 'src/*_test.js' -x 'src/fake_chrome.js'
	@echo $(DIST)/tico-$(VERSION).zip
