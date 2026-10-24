export const $id = <T extends Element = HTMLElement>(id: string): T =>
  document.getElementById(id) as unknown as T;

export const $opt = <T extends Element = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as unknown as T | null;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHTML = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
