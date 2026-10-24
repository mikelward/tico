// The dim on unfocused windows (SPEC.md §10.1): a full-page overlay at 10%
// black that ignores the pointer. `overlay` runs inside the page, through
// chrome.scripting, so it uses nothing from this module.

export function overlay(on) {
  const ID = "tico-dim";
  const old = document.getElementById(ID);
  if (!on) {
    old?.remove();
    return;
  }
  if (old) return;
  const el = document.createElement("div");
  el.id = ID;
  el.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.1);pointer-events:none;z-index:2147483647";
  document.documentElement.append(el);
}
