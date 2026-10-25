(function attachReconnect(window) {
    function createBackoff({ baseMs = 5000, maxMs = 60000, jitter = 0.2, random = Math.random } = {}) {
        let delay = baseMs;

        function next() {
            const current = delay;
            delay = Math.min(delay * 2, maxMs);
            return current * (1 - jitter + random() * 2 * jitter);
        }

        function reset() {
            delay = baseMs;
        }

        return { next, reset };
    }

    // A refused WebSocket upgrade hides its HTTP status from the page. Asking
    // for the app page tells a lost session (redirect to the hub) apart from a
    // busy server; anything inconclusive counts as busy, so it never reloads.
    async function probeAccess(fetchFn, { timeoutMs = 5000 } = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetchFn('/', { redirect: 'manual', cache: 'no-store', signal: controller.signal });
            return res.type === 'opaqueredirect' || res.status === 401 ? 'reauth' : 'busy';
        } catch {
            return 'busy';
        } finally {
            clearTimeout(timer);
        }
    }

    window.ScrumPokerReconnect = {
        createBackoff,
        probeAccess
    };
})(window);
