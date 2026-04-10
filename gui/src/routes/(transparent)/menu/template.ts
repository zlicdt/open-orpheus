import type { BtnImages, BtnState, LayoutNode, ElementTemplate } from "./types";

// Template cache: style path → parsed template
const templateCache = new Map<string, ElementTemplate>();

/**
 * Parse a DUI attribute string like:
 * normalimage="file='btn/play.svg' svg_color='#ff483228'" hotimage="..."
 * into structured BtnImages.
 */
export function parseBtnUrl(url: string): BtnImages | null {
  const stateRe = /(normalimage|hotimage|pushedimage|disabledimage)="([^"]*)"/g;
  const states: Record<string, BtnState> = {};

  let m;
  while ((m = stateRe.exec(url)) !== null) {
    const key = m[1].replace("image", "");
    const attrs = m[2];
    const fileMatch = attrs.match(/file='([^']*)'/);
    if (!fileMatch) continue;
    const uri = fileMatch[1];
    const colorMatch = attrs.match(/svg_color='([^']*)'/);
    states[key] = { uri, color: colorMatch?.[1] };
  }

  if (!states.normal) return null;
  return {
    normal: states.normal,
    hot: states.hot,
    pushed: states.pushed,
    disabled: states.disabled,
  };
}

function parseNum(el: Element, attr: string): number | undefined {
  const v = el.getAttribute(attr);
  return v != null ? Number(v) : undefined;
}

function parseLayoutNode(
  el: Element,
  counter: { i: number }
): LayoutNode | null {
  const tag = el.tagName;
  if (tag === "HorizontalLayout") {
    return { type: "horizontal", children: parseChildren(el, counter) };
  }
  if (tag === "VerticalLayout") {
    return { type: "vertical", children: parseChildren(el, counter) };
  }
  if (tag === "Container") {
    return {
      type: "container",
      width: parseNum(el, "width"),
      height: parseNum(el, "height"),
      children: parseChildren(el, counter),
    };
  }
  if (tag === "Control") {
    return {
      type: "control",
      width: parseNum(el, "width"),
      height: parseNum(el, "height"),
    };
  }
  if (tag === "Button") {
    return {
      type: "button",
      width: parseNum(el, "width") ?? 24,
      height: parseNum(el, "height") ?? 24,
      index: counter.i++,
    };
  }
  // MenuButton and MenuLabel are part of the default element.xml template — skip them
  return null;
}

function parseChildren(parent: Element, counter: { i: number }): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  for (const child of parent.children) {
    const node = parseLayoutNode(child, counter);
    if (node) nodes.push(node);
  }
  return nodes;
}

function parseElementTemplate(xml: string): ElementTemplate | null {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const menuEl = doc.querySelector("MenuElement");
  if (!menuEl) return null;

  const layoutEl = menuEl.querySelector("MenuElementLayout");
  if (!layoutEl) return null;

  return {
    height: parseNum(menuEl, "height") ?? 30,
    minWidth: parseNum(menuEl, "minwidth") ?? 0,
    maxWidth: parseNum(menuEl, "maxwidth") ?? 300,
    layout: {
      type: "horizontal",
      children: parseChildren(layoutEl, { i: 0 }),
    },
  };
}

/** Parse and cache all raw XML templates sent from the main process. */
export function loadTemplates(rawTemplates: Record<string, string>) {
  for (const [style, xml] of Object.entries(rawTemplates)) {
    if (!templateCache.has(style)) {
      const tpl = parseElementTemplate(xml);
      if (tpl) templateCache.set(style, tpl);
    }
  }
}

/** Get cached template synchronously (must be preloaded). */
export function getCachedTemplate(style: string): ElementTemplate | null {
  return templateCache.get(style) ?? null;
}

/** Returns the appropriate image src for a btn given its parsed images and interaction state. */
export function btnStateSrc(
  images: BtnImages,
  enable: boolean,
  hovered: boolean,
  pressed: boolean
): string {
  if (!enable && images.disabled) return images.disabled.uri;
  if (pressed && images.pushed) return images.pushed.uri;
  if (hovered && images.hot) return images.hot.uri;
  return images.normal.uri;
}
