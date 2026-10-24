// Content script on the watched origins (SPEC.md §10.3): tells tico the page
// title whenever it changes, so tico can see an unread count go up. It reads
// nothing else on the page.

let last = null;
function report() {
  if (document.title === last) return;
  // This page's first report sets its baseline, whatever the tab showed before.
  const first = last === null;
  last = document.title;
  // The service worker may be restarting; the next title change reports again.
  chrome.runtime.sendMessage({ title: last, first }).catch(() => {});
}
report();
new MutationObserver(report).observe(document.head ?? document.documentElement, {
  subtree: true,
  childList: true,
  characterData: true,
});
