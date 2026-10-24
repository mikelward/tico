// The options page (SPEC.md §13). Every change is checked and saved at once
// to chrome.storage.sync; a bad one is reported, naming the setting, and
// isn't saved.

import { APP_COMMANDS } from "./apps.js";
import { checklist } from "./keys.js";
import { pattern } from "./watchers.js";
import { DEFAULT_SETTINGS, PER_MACHINE, pick, resolve, SETTINGS_KEY, SHARED } from "./settings.js";

const $ = (id) => document.getElementById(id);
const rows = $("clocks").tBodies[0];
const errors = $("errors");
const json = $("json");
const appRows = $("apps").tBodies[0];
// The keys as bound, which can differ from the manifest's suggestions.
let shortcuts = {};
const HOURS = { day: ["day-from", "day-to"], work: ["work-from", "work-to"] };

function showErrors(list) {
  errors.hidden = list.length === 0;
  errors.replaceChildren(...list.map((e) => Object.assign(document.createElement("p"), { textContent: e })));
}

function input(value, attrs, onChange = () => save()) {
  const i = Object.assign(document.createElement("input"), { value: value ?? "", ...attrs });
  i.addEventListener("change", onChange);
  return i;
}

function button(text, label, onClick) {
  const b = Object.assign(document.createElement("button"), { type: "button", textContent: text });
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  return b;
}

function clockRow(c) {
  const tr = document.createElement("tr");
  const cells = [
    input(c.label, { className: "label", maxLength: 4, ariaLabel: "Label", required: true }),
    input(c.zone, { className: "zone", ariaLabel: "Time zone", required: true }),
    input(c.city, { className: "city", ariaLabel: "City", placeholder: "from the zone" }),
  ];
  cells[1].setAttribute("list", "zones");
  const move = (by) => () => {
    const to = by < 0 ? tr.previousElementSibling : tr.nextElementSibling?.nextElementSibling;
    if (by < 0 && !to) return;
    rows.insertBefore(tr, to ?? null);
    save();
  };
  const order = document.createElement("td");
  order.className = "order";
  order.append(
    button("↑", "Move up", move(-1)),
    button("↓", "Move down", move(1)),
    button("×", "Remove", () => {
      tr.remove();
      save();
    }),
  );
  for (const c of cells) {
    const td = document.createElement("td");
    td.append(c);
    tr.append(td);
  }
  tr.append(order);
  return tr;
}

// The app keys are fixed in the manifest, so each has a row; leaving one's
// name and address empty turns it off.
function appRow(command, app) {
  const tr = document.createElement("tr");
  tr.dataset.command = command;
  const key = shortcuts[command] || "No key";
  const cells = [
    Object.assign(document.createElement("kbd"), { textContent: key }),
    input(app?.name, { className: "name", ariaLabel: `${key} app's name`, placeholder: "off" }),
    input(app?.url, { className: "url", ariaLabel: `${key} app's address`, type: "url", placeholder: "https://" }),
  ];
  for (const c of cells) {
    const td = document.createElement("td");
    td.append(c);
    tr.append(td);
  }
  return tr;
}

// The extra watched sites (§10.3). Settings sync, but a site's access is
// granted per Chromebook, so each shows whether it's watched here.
let watchedSites = [];

async function renderWatched() {
  const items = await Promise.all(
    watchedSites.map(async (site) => {
      const li = document.createElement("li");
      const granted = await chrome.permissions.contains({ origins: [pattern(site)] });
      li.append(site, " ", Object.assign(document.createElement("span"), { className: "muted", textContent: granted ? "watched" : "needs access here" }));
      if (!granted) {
        li.append(" ", button("Allow", `Allow ${site}`, async () => {
          if (await chrome.permissions.request({ origins: [pattern(site)] })) renderWatched();
        }));
      }
      li.append(" ", button("×", `Stop watching ${site}`, async () => {
        watchedSites = watchedSites.filter((s) => s !== site);
        if (await save()) {
          // Gives back this site's access; with all-sites access for the dim,
          // Chrome keeps that, which is fine: it's the dim's.
          await chrome.permissions.remove({ origins: [pattern(site)] });
          renderWatched();
        }
      }));
      return li;
    }),
  );
  $("watched").replaceChildren(...items);
}

// An emptied hour field is NaN, an error, not Number("")'s midnight.
function fromForm() {
  const clocks = [...rows.rows].map((tr) => {
    const [label, zone, city] = [...tr.querySelectorAll("input")].map((i) => i.value.trim());
    return city ? { label, zone, city } : { label, zone };
  });
  const hours = Object.fromEntries(Object.entries(HOURS).map(([k, ids]) => [k, ids.map((id) => ($(id).value.trim() === "" ? NaN : Number($(id).value)))]));
  const apps = [...appRows.rows].flatMap((tr) => {
    const [name, url] = [...tr.querySelectorAll("input")].map((i) => i.value.trim());
    return name || url ? [{ command: tr.dataset.command, name, url }] : [];
  });
  const strength = num($("dim-strength"));
  return { clocks, ...hours, apps, dimStrength: Number((strength / 100).toPrecision(12)), watched: [...watchedSites] };
}

function toForm(settings) {
  rows.replaceChildren(...settings.clocks.map(clockRow));
  $("dim-strength").value = Number((settings.dimStrength * 100).toPrecision(12));
  watchedSites = [...settings.watched];
  renderWatched();
  appRows.replaceChildren(...APP_COMMANDS.map((c) => appRow(c, settings.apps.find((a) => a.command === c))));
  for (const [k, ids] of Object.entries(HOURS)) ids.forEach((id, i) => ($(id).value = settings[k][i]));
  json.value = JSON.stringify(pick(settings, SHARED), null, 2);
}

// Saves the shared settings on the page, or says why not.
async function save(value = fromForm()) {
  const { settings, errors: found } = resolve(value);
  showErrors(found);
  if (found.length > 0) return false;
  await chrome.storage.sync.set({ [SETTINGS_KEY]: pick(settings, SHARED) });
  json.value = JSON.stringify(pick(settings, SHARED), null, 2);
  return true;
}

// This Chromebook's layouts, kept apart from the shared settings.
const ruleRows = $("rules").tBodies[0];

// Shown as stored, so saving another field can't round a width away;
// toPrecision only drops float noise like 33.300000000000004.
const percent = (fraction) => Number((fraction * 100).toPrecision(12));

function ruleRow(r) {
  const tr = document.createElement("tr");
  const local = () => saveLocal();
  const aspect = input(r.minAspect, { className: "aspect", type: "number", step: "0.1", min: "1", max: "10", ariaLabel: "From aspect ratio" }, local);
  const width = input(r.width === undefined ? "" : percent(r.width), { className: "width", type: "number", step: "any", min: "10", max: "100", ariaLabel: "Width, percent" }, local);
  const cells = [aspect, width, button("×", "Remove", () => {
    tr.remove();
    saveLocal();
  })];
  for (const c of cells) {
    const td = document.createElement("td");
    td.append(c);
    tr.append(td);
  }
  return tr;
}

const num = (input) => (input.value.trim() === "" ? NaN : Number(input.value));

function layoutFromForm() {
  const singleRules = [...ruleRows.rows].map((tr) => {
    const [aspect, width] = tr.querySelectorAll("input");
    return { minAspect: num(aspect), width: Number((num(width) / 100).toPrecision(12)) };
  });
  return { singleRules, ultrawideAspect: num($("ultrawide")) };
}

function layoutToForm(settings) {
  ruleRows.replaceChildren(...settings.singleRules.map(ruleRow));
  $("ultrawide").value = settings.ultrawideAspect;
}

async function saveLocal() {
  const { settings, errors: found } = resolve(undefined, layoutFromForm());
  showErrors(found);
  if (found.length > 0) return false;
  // Merged in, so other overrides this Chromebook keeps stay.
  const kept = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  const base = kept && typeof kept === "object" && !Array.isArray(kept) ? kept : {};
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...base, ...pick(settings, PER_MACHINE) } });
  return true;
}

$("add-clock").addEventListener("click", () => {
  rows.append(clockRow({ label: "", zone: "" }));
  rows.lastElementChild.querySelector("input").focus();
});
for (const ids of Object.values(HOURS)) for (const id of ids) $(id).addEventListener("change", () => save());
$("dim-strength").addEventListener("change", () => save());
// Chrome asks for a site's access only from a click, so Watch asks first and
// saves the site once it's granted.
$("watch-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  let origin;
  try {
    origin = new URL($("watch-site").value.trim()).origin;
  } catch {
    showErrors([`"${$("watch-site").value}" isn't a site's address`]);
    return;
  }
  if (!origin.startsWith("https://")) {
    showErrors([`${origin} must be https`]);
    return;
  }
  if (!(await chrome.permissions.request({ origins: [pattern(origin)] }))) {
    showErrors([`tico needs access to ${origin} to watch it`]);
    return;
  }
  if (!watchedSites.includes(origin)) watchedSites.push(origin);
  if (await save()) {
    $("watch-site").value = "";
    renderWatched();
  }
});

$("import").addEventListener("click", async () => {
  let value;
  try {
    value = JSON.parse(json.value);
  } catch (e) {
    showErrors([`The JSON doesn't parse: ${e.message}`]);
    return;
  }
  // null or a list would read as nothing stored, a reset nobody asked for.
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    showErrors(["The settings must be a JSON object, like {\"clocks\": [...]}"]);
    return;
  }
  const here = Object.keys(value).filter((k) => PER_MACHINE.includes(k));
  if (here.length > 0) {
    showErrors([`${here.join(", ")} ${here.length > 1 ? "are" : "is"} set for each Chromebook, under Layouts, not imported`]);
    return;
  }
  // Settings left out keep their defaults, as tide's files do.
  const whole = { ...pick(DEFAULT_SETTINGS, SHARED), ...value };
  if (await save(whole)) toForm(resolve(whole).settings);
});
$("reset").addEventListener("click", async () => {
  await chrome.storage.sync.remove(SETTINGS_KEY);
  showErrors([]);
  toForm(DEFAULT_SETTINGS);
});

$("zones").replaceChildren(
  ...Intl.supportedValuesOf("timeZone").map((z) => Object.assign(document.createElement("option"), { value: z })),
);
// The page edits the shared settings alone, so saving never copies this
// machine's overrides to the others. What's stored may predate a check, so
// say what was wrong with it.
// The keys checklist, refreshed when you come back from the shortcuts page.
async function renderKeys() {
  const bound = await chrome.commands.getAll();
  shortcuts = Object.fromEntries(bound.map((c) => [c.name, c.shortcut]));
  for (const tr of appRows.rows) tr.querySelector("kbd").textContent = shortcuts[tr.dataset.command] || "No key";
  const rows = checklist(chrome.runtime.getManifest().commands, bound);
  // A command on another key is your choice (or Chrome's default off
  // ChromeOS), so only an unbound one is still to do.
  const todo = rows.filter((r) => r.state === "unbound").length;
  $("keys-summary").textContent = todo === 0 ? "Every command has a key." : `${todo} of ${rows.length} commands have no key yet.`;
  // Still to do first, in manifest order.
  const order = { unbound: 0, other: 1, bound: 2 };
  $("keys").tBodies[0].replaceChildren(
    ...[...rows].sort((a, b) => order[a.state] - order[b.state]).map((r) => {
      const tr = document.createElement("tr");
      tr.className = r.state;
      const cells = [r.title, r.intended, r.state === "unbound" ? "not bound" : r.bound];
      for (const text of cells) tr.append(Object.assign(document.createElement("td"), { textContent: text }));
      return tr;
    }),
  );
}
$("open-shortcuts").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
window.addEventListener("focus", () => renderKeys());
await renderKeys();
const shared = (await chrome.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY];
const { settings, errors: stored } = resolve(shared);
toForm(settings);
const local = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
const mine = resolve(undefined, local);
layoutToForm(mine.settings);
showErrors([...stored, ...mine.errors]);
const overrides = local && typeof local === "object" ? Object.keys(local).filter((k) => SHARED.includes(k)) : [];
if (overrides.length > 0) {
  $("overrides").textContent = `This Chromebook overrides ${overrides.join(", ")}, so those may differ here.`;
  $("overrides").hidden = false;
}
$("ultrawide").addEventListener("change", () => saveLocal());
$("add-rule").addEventListener("click", () => {
  ruleRows.append(ruleRow({}));
  ruleRows.lastElementChild.querySelector("input").focus();
});

// Another tab or Chromebook changed the settings: show theirs, so the
// next save here builds on them rather than undoing them. A change the page
// already shows, its own save included, leaves the form and its focus be.
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[SETTINGS_KEY];
  if (!change) return;
  if (area === "local") {
    const mine = resolve(undefined, change.newValue);
    const shown = resolve(undefined, layoutFromForm()).settings;
    if (JSON.stringify(pick(mine.settings, PER_MACHINE)) !== JSON.stringify(pick(shown, PER_MACHINE))) {
      layoutToForm(mine.settings);
    }
    return;
  }
  if (area !== "sync") return;
  const fresh = resolve(change.newValue);
  if (JSON.stringify(fresh.settings) === JSON.stringify(resolve(fromForm()).settings)) return;
  toForm(fresh.settings);
  showErrors(fresh.errors);
});
