/* ==========================================================================
   ROTATIONAL — CHARACTER MODULE
   ==========================================================================
   Owns character customization (name, appearance) and renders a reactive
   SVG portrait. Purely cosmetic — nothing in here affects game rules or
   state in game-logic.js. app.js calls into this module to render the
   customize screen and the portrait; this module never touches GameEngine
   directly, it's just handed mood values to react to.
   ========================================================================== */

const CharacterModule = (function (global) {
  "use strict";

  const SKIN_TONES = ["#f2c9a1", "#e0ac7e", "#c4884f", "#8d5a34", "#5c3a20"];
  const HAIR_COLORS = ["#2b2019", "#5a3825", "#8a5a2b", "#c9a227", "#1c1c1c"];
  const KIT_COLORS = ["#d9a441", "#6fae70", "#c1554a", "#4a7bb0", "#eee7d6"];
  const HAIR_STYLES = ["short", "curly", "buzzed", "long"];

  let customization = {
    name: "Alex Rowe",
    skinTone: SKIN_TONES[1],
    hairColor: HAIR_COLORS[0],
    hairStyle: "short",
    kitColor: KIT_COLORS[0]
  };

  function getCustomization() {
    return { ...customization };
  }

  function setField(field, value) {
    customization[field] = value;
  }

  /* ------------------------------------------------------------------------
     PORTRAIT — an SVG built from the customization + a mood derived from
     live game state. Mood is passed in as a plain object so this module
     never has to know about GameEngine's internals.
     mood: { tired: bool, stressed: bool, happy: bool, hurt: bool }
     ------------------------------------------------------------------------ */

  function hairPath(style, hairColor) {
    switch (style) {
      case "curly":
        return `
          <circle cx="38" cy="34" r="10" fill="${hairColor}"/>
          <circle cx="52" cy="26" r="11" fill="${hairColor}"/>
          <circle cx="68" cy="26" r="11" fill="${hairColor}"/>
          <circle cx="82" cy="34" r="10" fill="${hairColor}"/>
          <circle cx="60" cy="22" r="12" fill="${hairColor}"/>`;
      case "buzzed":
        return `<path d="M32,38 Q60,14 88,38 L88,32 Q60,10 32,32 Z" fill="${hairColor}"/>`;
      case "long":
        return `
          <path d="M28,40 Q30,10 60,10 Q90,10 92,40 L92,78 Q84,66 84,50 L80,40 Q60,26 40,40 L36,50 Q36,66 28,78 Z" fill="${hairColor}"/>`;
      case "short":
      default:
        return `<path d="M30,40 Q32,14 60,13 Q88,14 90,40 Q88,28 60,26 Q32,28 30,40 Z" fill="${hairColor}"/>`;
    }
  }

  function eyePair(mood) {
    if (mood.tired) {
      return `
        <path d="M42,58 Q48,62 54,58" stroke="#2a221a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M66,58 Q72,62 78,58" stroke="#2a221a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
    }
    return `
      <ellipse cx="48" cy="58" rx="4" ry="5" fill="#2a221a"/>
      <ellipse cx="72" cy="58" rx="4" ry="5" fill="#2a221a"/>`;
  }

  function eyebrows(mood) {
    if (mood.stressed) {
      return `
        <path d="M40,49 L54,53" stroke="#2a221a" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M80,49 L66,53" stroke="#2a221a" stroke-width="2.5" stroke-linecap="round"/>`;
    }
    return `
      <path d="M41,50 Q48,46 55,49" stroke="#2a221a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M65,49 Q72,46 79,50" stroke="#2a221a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  }

  function mouth(mood) {
    if (mood.happy) return `<path d="M46,76 Q60,90 74,76" stroke="#3a271a" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (mood.stressed || mood.hurt) return `<path d="M46,82 Q60,72 74,82" stroke="#3a271a" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    return `<path d="M48,79 L72,79" stroke="#3a271a" stroke-width="3" stroke-linecap="round"/>`;
  }

  function extras(mood) {
    let out = "";
    if (mood.stressed) {
      out += `<path d="M84,38 Q88,46 84,52 Q80,46 84,38 Z" fill="#8ecbe8" opacity="0.85"/>`;
    }
    if (mood.hurt) {
      out += `
        <rect x="46" y="44" width="26" height="7" rx="2" fill="#eee7d6" transform="rotate(-8 60 47)"/>
        <line x1="50" y1="44" x2="52" y2="51" stroke="#c1554a" stroke-width="1.5" transform="rotate(-8 60 47)"/>
        <line x1="66" y1="44" x2="68" y2="51" stroke="#c1554a" stroke-width="1.5" transform="rotate(-8 60 47)"/>`;
    }
    return out;
  }

  function renderPortraitSVG(mood) {
    mood = mood || {};
    const c = customization;
    return `
      <svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="60" cy="118" rx="30" ry="10" fill="#0c1712"/>
        <path d="M30,130 L36,96 Q60,88 84,96 L90,130 Z" fill="${c.kitColor}"/>
        <path d="M50,94 L60,104 L70,94 L66,90 L54,90 Z" fill="${c.skinTone}"/>
        <circle cx="60" cy="62" r="34" fill="${c.skinTone}"/>
        ${eyebrows(mood)}
        ${eyePair(mood)}
        ${mouth(mood)}
        ${hairPath(c.hairStyle, c.hairColor)}
        ${extras(mood)}
      </svg>`;
  }

  /* ------------------------------------------------------------------------
     CUSTOMIZE SCREEN — returns HTML for the picker UI. app.js is
     responsible for wiring click handlers (see wireCustomizeControls).
     ------------------------------------------------------------------------ */

  function swatchRow(name, options, current, isColor) {
    return `
      <div class="swatch-row" data-field="${name}">
        ${options.map(opt => `
          <button class="swatch ${opt === current ? "swatch-active" : ""}" data-field="${name}" data-value="${opt}"
            style="${isColor ? `background:${opt};` : ""}">
            ${isColor ? "" : opt.slice(0, 1).toUpperCase()}
          </button>
        `).join("")}
      </div>`;
  }

  function renderCustomizeHTML() {
    const c = customization;
    return `
      <div class="customize-grid">
        <div class="portrait-frame portrait-large" id="portrait-mount">${renderPortraitSVG({})}</div>
        <div class="customize-controls">
          <label class="field-label" for="name-input">Player name</label>
          <input class="name-input" id="name-input" type="text" maxlength="24" value="${c.name}">

          <div class="field-label">Skin tone</div>
          ${swatchRow("skinTone", SKIN_TONES, c.skinTone, true)}

          <div class="field-label">Hair style</div>
          ${swatchRow("hairStyle", HAIR_STYLES, c.hairStyle, false)}

          <div class="field-label">Hair color</div>
          ${swatchRow("hairColor", HAIR_COLORS, c.hairColor, true)}

          <div class="field-label">Kit color</div>
          ${swatchRow("kitColor", KIT_COLORS, c.kitColor, true)}
        </div>
      </div>`;
  }

  // Wires up the controls rendered by renderCustomizeHTML. Call once after
  // inserting that HTML into the DOM. onChange fires after every edit so
  // the caller can re-render the live portrait preview.
  function wireCustomizeControls(onChange) {
    document.getElementById("name-input").addEventListener("input", (e) => {
      setField("name", e.target.value || "Alex Rowe");
      onChange();
    });
    document.querySelectorAll(".swatch").forEach(btn => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        setField(field, value);
        document.querySelectorAll(`.swatch[data-field="${field}"]`).forEach(b => b.classList.remove("swatch-active"));
        btn.classList.add("swatch-active");
        onChange();
      });
    });
  }

  function refreshPortraitPreview(mood) {
    const mount = document.getElementById("portrait-mount");
    if (mount) mount.innerHTML = renderPortraitSVG(mood);
  }

  const api = {
    getCustomization,
    renderPortraitSVG,
    renderCustomizeHTML,
    wireCustomizeControls,
    refreshPortraitPreview
  };

  global.CharacterModule = api;
  return api;
})(typeof window !== "undefined" ? window : globalThis);
