// The extension's service worker. MV3 delivers the event that wakes a
// sleeping worker only to listeners added synchronously when this script
// first runs, so every listener is added here, at the top level, and tico
// loads its saved state on the first event it handles.

import { DIM_ORIGINS, Tico } from "./tico.js";

const tico = new Tico(chrome);
const changed = () => tico.event();
const commands = new Set(Object.keys(chrome.runtime.getManifest().commands));

chrome.commands.onCommand.addListener((name) => tico.command(name));
chrome.windows.onCreated.addListener(changed);
chrome.windows.onRemoved.addListener(changed);
chrome.windows.onFocusChanged.addListener(changed);
chrome.windows.onBoundsChanged.addListener(changed);
chrome.system.display.onDisplayChanged.addListener(changed);
chrome.runtime.onStartup.addListener(changed);
chrome.runtime.onInstalled.addListener(changed);
// A newly active tab needs the dim if its window has it, and so does a
// dimmed tab that loaded a new page.
chrome.tabs.onActivated.addListener(changed);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "complete") tico.tabLoaded(tabId);
});
// Granting all-sites access is turning the dim on (§10.1), even if the
// popup that asked closed during the prompt.
chrome.permissions.onAdded.addListener((granted) => {
  if (DIM_ORIGINS.every((o) => granted.origins?.includes(o))) tico.setDim(true);
  else changed();
});
chrome.permissions.onRemoved.addListener(changed);
// The toolbar button opens the dashboard, as its key does (§8.1).
chrome.action.onClicked.addListener(() => tico.command("popup"));

// The launcher runs commands too, but only ones the manifest declares. Pages on the watched origins report their titles (§10.3). The
// popup turns the dim on and off, answering once it's done so the popup can
// give back the access only after every page is undimmed.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const fromTico = sender.url?.startsWith(chrome.runtime.getURL(""));
  const done = (p) => {
    p.then(() => respond(true), () => respond(false));
    return true;
  };
  // The launcher waits for each step before it closes itself (§9.4).
  if (commands.has(message?.command)) return done(tico.command(message.command));
  if (fromTico && Number.isInteger(message?.tabId) && Number.isInteger(message?.windowId)) {
    return done(tico.activateTab(message.tabId, message.windowId));
  }
  if (typeof message?.title === "string" && sender.tab) tico.title(sender.tab.id, sender.tab.windowId, message.title, message.first === true);
  else if (typeof message?.dim === "boolean" && fromTico) {
    tico.setDim(message.dim).then(() => respond(true), () => respond(false));
    return true;
  }
});
