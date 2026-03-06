(function (window) {
    "use strict";

    // Optional override for non-default API host (e.g. Railway backend domain).
    window.APP_CONFIG = window.APP_CONFIG || {};
    window.APP_CONFIG.API_BASE = window.APP_CONFIG.API_BASE || "";
})(window);