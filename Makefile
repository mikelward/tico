# Every test file runs from here. `make test` fails if a *_test.js under
# src/ isn't listed, since an unlisted test never runs.
TESTS = \
	src/apps_test.js \
	src/clocks_test.js \
	src/dim_test.js \
	src/geometry_test.js \
	src/launcher_test.js \
	src/restart_test.js \
	src/settings_test.js \
	src/unread_test.js \
	src/workspaces_test.js \
	src/tico_test.js \
	src/manifest_test.js

.PHONY: test
test:
	@unlisted=$$(find src -name '*_test.js' | sort | while read -r f; do \
		case " $(TESTS) " in *" $$f "*) ;; *) echo "$$f";; esac; done); \
	if test -n "$$unlisted"; then echo "not in the Makefile's TESTS: $$unlisted" >&2; exit 1; fi
	node --test $(TESTS)
