// The extension's service worker. MV3 delivers the event that wakes a
// sleeping worker only to listeners added synchronously when this script
// first runs, so every listener is added here, at the top level, and tico
// loads its saved state on the first event it handles.

import { Tico } from "./tico.js";

const tico = new Tico(chrome);
const changed = () => tico.event();

chrome.commands.onCommand.addListener((name) => tico.command(name));
chrome.windows.onCreated.addListener(changed);
chrome.windows.onRemoved.addListener(changed);
chrome.windows.onFocusChanged.addListener(changed);
chrome.windows.onBoundsChanged.addListener(changed);
chrome.system.display.onDisplayChanged.addListener(changed);
chrome.runtime.onStartup.addListener(changed);
chrome.runtime.onInstalled.addListener(changed);
