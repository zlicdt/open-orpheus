import sharp, { SharpInput } from "sharp";

import packManager from "../pack";
import SkinPack from "../packs/SkinPack";
import type { MenuSkin } from "./types";

export const menuSkin: MenuSkin = {
  background: "#fffffffa",
  foreground: "#1e1e1e",
  foregroundDisabled: "#a0a0a0",
  separator: "#0000001a",
  itemHover: "#e1ebfc",
};

async function extractColor(img: SharpInput): Promise<string> {
  const image = sharp(img);
  const { width = 1, height = 1 } = await image.metadata();
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const { data } = await image
    .extract({ left: cx, top: cy, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b, a] = data;
  return `#${[r, g, b, a].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function abgrToCssHex(abgr: string): string {
  const hex = abgr.replace(/^#/, "");
  const a = hex.slice(0, 2);
  const b = hex.slice(2, 4);
  const g = hex.slice(4, 6);
  const r = hex.slice(6, 8);
  return `#${r}${g}${b}${a}`;
}

export function registerMenuSkinUpdater() {
  packManager.addEventListener("skin2packloaded", async () => {
    const skinPack = packManager.getPack<SkinPack>("skin2");
    const [bg, hov, sep, elBuf] = await Promise.all(
      [
        "/menu/bk.png",
        "/menu/hover.png",
        "/menu/separator.png",
        "/menu/element.xml",
      ].map((p) => skinPack.readFile(p))
    );
    const [bgColor, hoverColor, separatorColor] = await Promise.all(
      [bg, hov, sep].map(extractColor)
    );

    const xml = elBuf.toString("utf-8");
    const fgMatch = xml.match(/\btextcolor="(#[0-9A-Fa-f]{8})"/);
    const fgDisabledMatch = xml.match(
      /\bdisabledtextcolor="(#[0-9A-Fa-f]{8})"/
    );

    menuSkin.background = bgColor;
    menuSkin.itemHover = hoverColor;
    menuSkin.separator = separatorColor;
    if (fgMatch) menuSkin.foreground = abgrToCssHex(fgMatch[1]);
    if (fgDisabledMatch) {
      menuSkin.foregroundDisabled = abgrToCssHex(fgDisabledMatch[1]);
    }
  });
}
