// The outer height that fits a window's content (SPEC.md §8.1): the content,
// plus the frame the window adds around it, no taller than the screen allows.
export function fitHeight({ content, outer, inner, available }) {
  return Math.min(content + (outer - inner), available);
}
