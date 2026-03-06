(function (window) {
    "use strict";

    window.APP_CONFIG = window.APP_CONFIG || {};

    var host = String(window.location.hostname || "").trim().toLowerCase();
    var privateIpv4Pattern = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;

    var isLocalHost = host === "localhost"
        || host === "127.0.0.1"
        || host === "::1"
        || host === "0.0.0.0"
        || privateIpv4Pattern.test(host);

    // Local dev: biarkan kosong agar app-config fallback ke http://<host>:3001/api.
    // Public domain: arahkan ke backend Railway.
    window.APP_CONFIG.API_BASE = isLocalHost
        ? ""
        : "https://computer-inventory-production.up.railway.app/api";
})(window);
