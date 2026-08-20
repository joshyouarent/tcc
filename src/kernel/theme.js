export const FONT = '"Montserrat", "Avenir Next", "Century Gothic", system-ui, -apple-system, sans-serif';

// Seven steps. 16px on inputs is not a taste call: Safari on iOS zooms the page
// when you focus a field smaller than that.
export const TYPE = {
  micro: "11px", small: "12px", body: "14px", input: "16px",
  strong: "18px", numeral: "22px", hero: "34px",
};

export const THEME = {
  dark: {
    bg: "#0b1013", panel: "#111a1e", accent: "#36aecb", accentText: "#36aecb",
    soft: "rgba(54,174,203,0.12)", border: "rgba(54,174,203,0.26)",
    borderStrong: "rgba(54,174,203,0.50)", text: "#e8f4f8",
    muted: "#a8b0b2", faint: "#828384", ring: "#828384",
    band: "rgba(130,131,132,0.09)", warn: "#e0a848", danger: "#e07a7a",
    line: "rgba(130,131,132,0.30)", good: "#5fd39a",
  },
  light: {
    bg: "#f5f8f9", panel: "#ffffff", accent: "#36aecb", accentText: "#1b7a91",
    soft: "rgba(54,174,203,0.10)", border: "rgba(54,174,203,0.35)",
    borderStrong: "rgba(54,174,203,0.60)", text: "#0d1a1e",
    muted: "#5d6668", faint: "#828384", ring: "#828384",
    band: "rgba(130,131,132,0.10)", warn: "#8a5d12", danger: "#a33a3a",
    line: "rgba(130,131,132,0.35)", good: "#1c8158",
  },
};
