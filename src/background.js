// The extension's service worker. MV3 delivers the event that wakes a
// sleeping worker only to listeners added synchronously when this script
// first runs, so every listener is added here, at the top level, and tico
// loads its saved state on the first event it handles.

import { Tico } from "./tico.js";

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

// The popup and home window run commands too, but only ones the manifest
// declares. Pages on the watched origins report their titles (§10.3).
chrome.runtime.onMessage.addListener((message, sender) => {
  if (commands.has(message?.command)) tico.command(message.command);
  else if (typeof message?.title === "string" && sender.tab) tico.title(sender.tab.id, sender.tab.windowId, message.title, message.first === true);
});
