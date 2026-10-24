// A fake of the parts of `chrome` tico uses, for tests. Windows and displays
// are plain objects the test can read and change; every call returns a
// promise, like MV3's chrome.* APIs.

export class FakeChrome {
  constructor({ displays, windows = [] }) {
    this.displaysList = displays;
    this.wins = windows.map((w) => ({ type: "normal", state: "normal", focused: false, alwaysOnTop: false, ...w }));
    this.store = {};
    this.updates = [];
    this.created = [];
    this.removed = [];
    const fake = this;
    this.system = { display: { getInfo: async () => structuredClone(fake.displaysList) } };
    this.storage = {
      local: {
        get: async (key) => (key in fake.store ? { [key]: structuredClone(fake.store[key]) } : {}),
        set: async (items) => {
          for (const [k, v] of Object.entries(items)) fake.store[k] = structuredClone(v);
        },
      },
    };
    this.windows = {
      getAll: async ({ windowTypes, populate } = {}) =>
        structuredClone(
          fake.wins
            .filter((w) => !windowTypes || windowTypes.includes(w.type))
            .map((w) => (populate ? { ...w, tabs: [{ url: w.url ?? "chrome://newtab/" }] } : w)),
        ),
      create: async ({ url, type = "normal", focused = false, left = 100, top = 100, width = 800, height = 600 } = {}) => {
        const id = Math.max(0, ...fake.wins.map((w) => w.id)) + 1;
        fake.created.push({ id, url, type });
        fake.open({ id, url, type, left, top, width, height });
        if (focused) fake.focus(id);
        return structuredClone(fake.win(id));
      },
      update: async (id, props) => {
        fake.updates.push({ id, ...props });
        const w = fake.win(id);
        if (props.focused) {
          for (const o of fake.wins) o.focused = false;
          if (w.state === "minimized") w.state = "normal";
        }
        Object.assign(w, props);
        return structuredClone(w);
      },
      remove: async (id) => {
        fake.win(id);
        fake.removed.push(id);
        fake.wins = fake.wins.filter((w) => w.id !== id);
      },
    };
    this.runtime = { getURL: (path) => `chrome-extension://tico/${path}` };
    this.badge = "";
    this.badgeColor = null;
    this.toolbar = true;
    this.popups = 0;
    this.action = {
      setBadgeText: async ({ text }) => {
        fake.badge = text;
      },
      setBadgeBackgroundColor: async ({ color }) => {
        fake.badgeColor = color;
      },
      openPopup: async () => {
        const w = fake.wins.find((x) => x.focused);
        if (!fake.toolbar || (w && w.type !== "normal")) throw new Error("Browser window has no toolbar.");
        fake.popups++;
      },
    };
  }

  win(id) {
    const w = this.wins.find((x) => x.id === id);
    if (!w) throw new Error(`no window ${id}`);
    return w;
  }

  open(w) {
    this.wins.push({ type: "normal", state: "normal", focused: false, alwaysOnTop: false, ...w });
  }

  focus(id) {
    for (const o of this.wins) o.focused = o.id === id;
  }

  box(id) {
    const w = this.win(id);
    return { x: w.left, y: w.top, w: w.width, h: w.height };
  }
}

export const HD = { id: "hd", bounds: { left: 0, top: 0, width: 1920, height: 1080 }, workArea: { left: 0, top: 0, width: 1920, height: 1032 } };
export const UW = { id: "uw", bounds: { left: 1920, top: 0, width: 3440, height: 1440 }, workArea: { left: 1920, top: 0, width: 3440, height: 1392 } };
