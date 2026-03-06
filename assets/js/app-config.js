(function (window) {
    "use strict";

    function cleanText(value) {
        return String(value || "").trim();
    }

    function removeTrailingSlash(value) {
        return value.replace(/\/+$/, "");
    }

    function isAbsoluteUrl(value) {
        return /^https?:\/\//i.test(value);
    }

    function buildAbsoluteUrl(value) {
        if (!value) {
            return "";
        }

        if (isAbsoluteUrl(value)) {
            return value;
        }

        if (value.startsWith("//")) {
            return window.location.protocol + value;
        }

        if (value.startsWith("/")) {
            return window.location.origin + value;
        }

        return value;
    }

    function normalizeApiBase(input) {
        var value = removeTrailingSlash(cleanText(input));
        if (!value) {
            return "";
        }

        value = buildAbsoluteUrl(value);

        if (!/\/api$/i.test(value)) {
            value += "/api";
        }

        return value;
    }

    function isPrivateIpv4(hostname) {
        var match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
        if (!match) {
            return false;
        }

        var first = Number(match[1]);
        var second = Number(match[2]);

        if (first === 10 || first === 127) {
            return true;
        }

        if (first === 192 && second === 168) {
            return true;
        }

        if (first === 172 && second >= 16 && second <= 31) {
            return true;
        }

        return false;
    }

    function isLocalDevelopmentHost(hostname) {
        var host = cleanText(hostname).toLowerCase();
        if (!host) {
            return true;
        }

        if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") {
            return true;
        }

        if (isPrivateIpv4(host)) {
            return true;
        }

        if (host.endsWith(".local")) {
            return true;
        }

        return !host.includes(".");
    }

    function resolveHttpProtocol() {
        return window.location.protocol === "https:" ? "https:" : "http:";
    }

    function resolveDefaultApiBase() {
        var hostname = cleanText(window.location.hostname) || "localhost";
        if (isLocalDevelopmentHost(hostname)) {
            var apiHostname = hostname === "0.0.0.0" ? "localhost" : hostname;
            return normalizeApiBase(resolveHttpProtocol() + "//" + apiHostname + ":3001/api");
        }

        return normalizeApiBase("/api");
    }

    function resolveApiBase() {
        var appConfig = window.APP_CONFIG && typeof window.APP_CONFIG === "object"
            ? window.APP_CONFIG
            : {};
        var configuredBase = cleanText(appConfig.API_BASE);

        if (configuredBase) {
            return normalizeApiBase(configuredBase);
        }

        return resolveDefaultApiBase();
    }

    function resolveApiOrigin(apiBase) {
        var fallbackOrigin = window.location.origin;
        var base = cleanText(apiBase);

        if (!base) {
            return fallbackOrigin;
        }

        try {
            var target = new URL(base, fallbackOrigin);
            return target.origin;
        } catch (_error) {
            return fallbackOrigin;
        }
    }

    function resolveAssetUrl(value) {
        var rawValue = cleanText(value);
        if (!rawValue) {
            return "";
        }

        if (/^(https?:|data:|blob:)/i.test(rawValue)) {
            return rawValue;
        }

        if (rawValue.startsWith("//")) {
            return window.location.protocol + rawValue;
        }

        if (rawValue.startsWith("/")) {
            return window.AppConfig.API_ORIGIN + rawValue;
        }

        return rawValue;
    }

    var appConfig = window.AppConfig && typeof window.AppConfig === "object"
        ? window.AppConfig
        : {};

    appConfig.API_BASE = resolveApiBase();
    appConfig.API_ORIGIN = resolveApiOrigin(appConfig.API_BASE);
    appConfig.resolveAssetUrl = resolveAssetUrl;

    window.AppConfig = appConfig;
})(window);
