(function (window) {
    "use strict";

    var TOKEN_KEY = "inventory_auth_token";
    var USER_KEY = "inventory_auth_user";
    var ROLE_KEY = "inventory_user_role";

    function getSafeStorage(type) {
        try {
            return type === "session" ? window.sessionStorage : window.localStorage;
        } catch (_error) {
            return null;
        }
    }

    function getCurrentPageWithQuery() {
        var pageName = String(window.location.pathname || "").split("/").pop() || "index.html";
        return pageName + window.location.search;
    }

    function parseUser(raw) {
        if (!raw) {
            return null;
        }

        try {
            var parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (_error) {
            return null;
        }
    }

    function getTokenFromStorage(storage) {
        if (!storage) {
            return "";
        }

        return String(storage.getItem(TOKEN_KEY) || "").trim();
    }

    function getUserFromStorage(storage) {
        if (!storage) {
            return null;
        }

        return parseUser(storage.getItem(USER_KEY));
    }

    function getToken() {
        return getTokenFromStorage(getSafeStorage("local")) || getTokenFromStorage(getSafeStorage("session"));
    }

    function getUser() {
        return getUserFromStorage(getSafeStorage("local")) || getUserFromStorage(getSafeStorage("session"));
    }

    function getActiveSessionStorage() {
        var localStorageRef = getSafeStorage("local");
        if (getTokenFromStorage(localStorageRef)) {
            return localStorageRef;
        }

        var sessionStorageRef = getSafeStorage("session");
        if (getTokenFromStorage(sessionStorageRef)) {
            return sessionStorageRef;
        }

        return null;
    }

    function getUserRole() {
        var user = getUser();
        var role = String((user && user.role) || "").trim().toLowerCase();
        return role === "admin" || role === "user" ? role : "";
    }

    function isAuthenticated() {
        return Boolean(getToken() && getUser());
    }

    function clearSession() {
        var localStorageRef = getSafeStorage("local");
        var sessionStorageRef = getSafeStorage("session");
        [localStorageRef, sessionStorageRef].forEach(function (storage) {
            if (!storage) {
                return;
            }

            storage.removeItem(TOKEN_KEY);
            storage.removeItem(USER_KEY);
            storage.removeItem(ROLE_KEY);
        });
    }

    function setSession(token, user, rememberMe) {
        var tokenText = String(token || "").trim();
        if (!tokenText || !user || typeof user !== "object") {
            return;
        }

        var roleText = String(user.role || "").trim().toLowerCase();
        var persistToLocal = rememberMe !== false;
        var targetStorage = getSafeStorage(persistToLocal ? "local" : "session");
        var otherStorage = getSafeStorage(persistToLocal ? "session" : "local");

        if (!targetStorage) {
            return;
        }

        if (otherStorage) {
            otherStorage.removeItem(TOKEN_KEY);
            otherStorage.removeItem(USER_KEY);
            otherStorage.removeItem(ROLE_KEY);
        }

        targetStorage.setItem(TOKEN_KEY, tokenText);
        targetStorage.setItem(USER_KEY, JSON.stringify(user));
        if (roleText === "admin" || roleText === "user") {
            targetStorage.setItem(ROLE_KEY, roleText);
        }
    }

    function setUser(user) {
        if (!user || typeof user !== "object") {
            return;
        }

        var storage = getActiveSessionStorage();
        if (!storage) {
            return;
        }

        var currentUser = getUserFromStorage(storage) || {};
        var nextUser = Object.assign({}, currentUser, user);
        var roleText = String(nextUser.role || "").trim().toLowerCase();

        storage.setItem(USER_KEY, JSON.stringify(nextUser));
        if (roleText === "admin" || roleText === "user") {
            storage.setItem(ROLE_KEY, roleText);
        }
    }

    function buildLoginUrl(next) {
        var nextTarget = String(next || "").trim() || getCurrentPageWithQuery();
        return "auth-login.html?next=" + encodeURIComponent(nextTarget);
    }

    function redirectToLogin(next) {
        window.location.href = buildLoginUrl(next);
    }

    function requireAuth() {
        if (!isAuthenticated()) {
            clearSession();
            redirectToLogin();
            return false;
        }

        return true;
    }

    function isSafeInternalPath(path) {
        var text = String(path || "").trim();
        if (!text) {
            return false;
        }

        if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("//")) {
            return false;
        }

        return true;
    }

    function redirectIfAuthenticated(defaultPath) {
        if (!isAuthenticated()) {
            return;
        }

        var fallback = String(defaultPath || "index.html").trim() || "index.html";
        window.location.href = isSafeInternalPath(fallback) ? fallback : "index.html";
    }

    function withAuth(options) {
        var token = getToken();
        var nextOptions = options ? Object.assign({}, options) : {};
        var headers = new Headers(nextOptions.headers || {});

        if (token && !headers.has("Authorization")) {
            headers.set("Authorization", "Bearer " + token);
        }

        nextOptions.headers = headers;
        return nextOptions;
    }

    async function fetchWithAuth(url, options) {
        var response = await window.fetch(url, withAuth(options));
        if (response.status === 401) {
            clearSession();
            redirectToLogin();
        }

        return response;
    }

    async function validateSession(apiBase) {
        if (!isAuthenticated()) {
            clearSession();
            redirectToLogin();
            return false;
        }

        var base = String(apiBase || "").trim();
        if (!base) {
            return true;
        }

        try {
            var response = await fetchWithAuth(base + "/auth/me", { method: "GET" });
            if (!response.ok) {
                clearSession();
                redirectToLogin();
                return false;
            }

            var result = await response.json().catch(function () { return {}; });
            if (result && result.data) {
                setUser(result.data);
            }

            return true;
        } catch (_error) {
            clearSession();
            redirectToLogin();
            return false;
        }
    }

    window.AuthClient = {
        getToken: getToken,
        getUser: getUser,
        getUserRole: getUserRole,
        isAuthenticated: isAuthenticated,
        setSession: setSession,
        setUser: setUser,
        clearSession: clearSession,
        requireAuth: requireAuth,
        redirectToLogin: redirectToLogin,
        redirectIfAuthenticated: redirectIfAuthenticated,
        withAuth: withAuth,
        fetchWithAuth: fetchWithAuth,
        validateSession: validateSession,
        isSafeInternalPath: isSafeInternalPath
    };
})(window);
