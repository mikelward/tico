// The options page (SPEC.md §13). Every change is checked and saved at once
// to chrome.storage.sync; a bad one is reported, naming the setting, and
// isn't saved.

import { DEFAULT_SETTINGS, resolve, SETTINGS_KEY } from "./settings.js";

const $ = (id) => document.getElementById(id);
const rows = $("clocks").tBodies[0];
const errors = $("errors");
const json = $("json");
const HOURS = { day: ["day-from", "day-to"], work: ["work-from", "work-to"] };

function showErrors(list) {
  errors.hidden = list.length === 0;
  errors.replaceChildren(...list.map((e) => Object.assign(document.createElement("p"), { textContent: e })));
}

function input(value, attrs) {
  const i = Object.assign(document.createElement("input"), { value: value ?? "", ...attrs });
  i.addEventListener("change", () => save());
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

// An emptied hour field is NaN, an error, not Number("")'s midnight.
function fromForm() {
  const clocks = [...rows.rows].map((tr) => {
    const [label, zone, city] = [...tr.querySelectorAll("input")].map((i) => i.value.trim());
    return city ? { label, zone, city } : { label, zone };
  });
  const hours = Object.fromEntries(Object.entries(HOURS).map(([k, ids]) => [k, ids.map((id) => ($(id).value.trim() === "" ? NaN : Number($(id).value)))]));
  return { clocks, ...hours };
}

function toForm(settings) {
  rows.replaceChildren(...settings.clocks.map(clockRow));
  for (const [k, ids] of Object.entries(HOURS)) ids.forEach((id, i) => ($(id).value = settings[k][i]));
  json.value = JSON.stringify(settings, null, 2);
}

// Saves what's on the page, or says why not.
async function save(value = fromForm()) {
  const { settings, errors: found } = resolve(value);
  showErrors(found);
  if (found.length > 0) return false;
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
  json.value = JSON.stringify(settings, null, 2);
  return true;
}

$("add-clock").addEventListener("click", () => {
  rows.append(clockRow({ label: "", zone: "" }));
  rows.lastElementChild.querySelector("input").focus();
});
for (const ids of Object.values(HOURS)) for (const id of ids) $(id).addEventListener("change", () => save());

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
  // Settings left out keep their defaults, as tide's files do.
  const whole = { ...DEFAULT_SETTINGS, ...value };
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
const shared = (await chrome.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY];
const { settings, errors: stored } = resolve(shared);
toForm(settings);
showErrors(stored);
const local = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
if (local && typeof local === "object" && Object.keys(local).length > 0) {
  $("overrides").textContent = `This Chromebook overrides ${Object.keys(local).join(", ")}, so those may differ here.`;
  $("overrides").hidden = false;
}

// Another tab or Chromebook changed the shared settings: show theirs, so the
// next save here builds on them rather than undoing them. A change the page
// already shows, its own save included, leaves the form and its focus be.
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[SETTINGS_KEY];
  if (area !== "sync" || !change) return;
  const fresh = resolve(change.newValue);
  if (JSON.stringify(fresh.settings) === JSON.stringify(resolve(fromForm()).settings)) return;
  toForm(fresh.settings);
  showErrors(fresh.errors);
});
