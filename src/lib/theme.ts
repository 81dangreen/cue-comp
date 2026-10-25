export const THEME_KEY = "theme";

/** Runs before first paint (inlined in <head>) so a saved dark theme doesn't flash light. */
export const themeInitScript = `try{if(localStorage.getItem("${THEME_KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
