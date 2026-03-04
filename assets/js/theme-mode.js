(function () {
  const THEME_KEY = "computer_inventory_theme";
  const THEME_SYNC_EVENT = "ci-theme-sync";
  const DARK_CLASS = "app-skin-dark";

  function normalizeTheme(value) {
    return String(value || "").trim().toLowerCase() === "dark" ? "dark" : "light";
  }

  function getStoredTheme() {
    try {
      const rawValue = window.localStorage.getItem(THEME_KEY);
      if (rawValue === null) {
        return "";
      }
      return normalizeTheme(rawValue);
    } catch (_error) {
      return "";
    }
  }

  function getPreferredTheme() {
    const storedTheme = getStoredTheme();
    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }

    const hasDarkClass = document.documentElement.classList.contains(DARK_CLASS);
    if (hasDarkClass) {
      return "dark";
    }

    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }

    return "light";
  }

  function updateThemeToggleButtons(theme) {
    const darkButtons = document.querySelectorAll(".dark-light-theme .dark-button");
    const lightButtons = document.querySelectorAll(".dark-light-theme .light-button");
    const isDark = theme === "dark";

    darkButtons.forEach((button) => {
      if (!(button instanceof HTMLElement)) return;
      button.style.display = isDark ? "none" : "inline-flex";
      button.setAttribute("aria-pressed", (!isDark).toString());
    });

    lightButtons.forEach((button) => {
      if (!(button instanceof HTMLElement)) return;
      button.style.display = isDark ? "inline-flex" : "none";
      button.setAttribute("aria-pressed", isDark.toString());
    });

    const lightInput = document.getElementById("app-skin-light");
    const darkInput = document.getElementById("app-skin-dark");
    if (lightInput instanceof HTMLInputElement) {
      lightInput.checked = !isDark;
    }
    if (darkInput instanceof HTMLInputElement) {
      darkInput.checked = isDark;
    }
  }

  function broadcastTheme(theme) {
    const payload = { type: THEME_SYNC_EVENT, theme };

    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(payload, window.location.origin);
      } catch (_error) {
        // Ignore cross-window errors.
      }
    }

    const frames = document.querySelectorAll("iframe");
    frames.forEach((frame) => {
      const target = frame.contentWindow;
      if (!target) {
        return;
      }

      try {
        target.postMessage(payload, window.location.origin);
      } catch (_error) {
        // Ignore cross-window errors.
      }
    });
  }

  function applyTheme(themeInput, options) {
    const config = {
      persist: true,
      broadcast: true,
      ...options,
    };

    const theme = normalizeTheme(themeInput);
    const isDark = theme === "dark";
    const root = document.documentElement;

    root.classList.toggle(DARK_CLASS, isDark);
    root.setAttribute("data-theme-mode", theme);

    if (config.persist) {
      try {
        window.localStorage.setItem(THEME_KEY, theme);
      } catch (_error) {
        // Ignore storage errors.
      }
    }

    updateThemeToggleButtons(theme);

    if (config.broadcast) {
      broadcastTheme(theme);
    }
  }

  function initializeThemeToggles() {
    const darkButtons = document.querySelectorAll(".dark-light-theme .dark-button");
    const lightButtons = document.querySelectorAll(".dark-light-theme .light-button");

    darkButtons.forEach((button) => {
      if (!(button instanceof HTMLElement) || button.dataset.themeModeBound === "true") {
        return;
      }

      button.dataset.themeModeBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        applyTheme("dark");
      });
    });

    lightButtons.forEach((button) => {
      if (!(button instanceof HTMLElement) || button.dataset.themeModeBound === "true") {
        return;
      }

      button.dataset.themeModeBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        applyTheme("light");
      });
    });

    const lightInput = document.getElementById("app-skin-light");
    const darkInput = document.getElementById("app-skin-dark");

    if (lightInput instanceof HTMLInputElement && lightInput.dataset.themeModeBound !== "true") {
      lightInput.dataset.themeModeBound = "true";
      lightInput.addEventListener("change", () => {
        if (lightInput.checked) {
          applyTheme("light");
        }
      });
    }

    if (darkInput instanceof HTMLInputElement && darkInput.dataset.themeModeBound !== "true") {
      darkInput.dataset.themeModeBound = "true";
      darkInput.addEventListener("change", () => {
        if (darkInput.checked) {
          applyTheme("dark");
        }
      });
    }
  }

  function initializeThemeSyncListeners() {
    window.addEventListener("storage", (event) => {
      if (event.key !== THEME_KEY) {
        return;
      }

      applyTheme(normalizeTheme(event.newValue), {
        persist: false,
        broadcast: false,
      });
    });

    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data;
      if (!data || data.type !== THEME_SYNC_EVENT) {
        return;
      }

      applyTheme(normalizeTheme(data.theme), {
        persist: true,
        broadcast: false,
      });
    });
  }

  window.ThemeMode = {
    apply: (theme) => applyTheme(theme),
    get: () => normalizeTheme(document.documentElement.getAttribute("data-theme-mode") || getStoredTheme()),
  };

  const initialTheme = getPreferredTheme();
  applyTheme(initialTheme, { persist: false, broadcast: false });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initializeThemeToggles();
      initializeThemeSyncListeners();
      applyTheme(getPreferredTheme(), { persist: false, broadcast: false });
    });
  } else {
    initializeThemeToggles();
    initializeThemeSyncListeners();
    applyTheme(getPreferredTheme(), { persist: false, broadcast: false });
  }
})();
