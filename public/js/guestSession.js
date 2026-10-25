(function attachGuestSession(window) {
    const STORAGE_KEY = 'scrumPokerGuest';

    function load(storage, token) {
        try {
            const entry = JSON.parse(storage.getItem(STORAGE_KEY));
            if (!entry || entry.token !== token || !entry.name) return null;
            return { name: entry.name, rejoinKey: entry.rejoinKey };
        } catch {
            return null;
        }
    }

    function save(storage, { token, name, rejoinKey }) {
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify({ token, name, rejoinKey }));
        } catch { /* storage unavailable: the guest just rejoins by hand */ }
    }

    function clear(storage) {
        try {
            storage.removeItem(STORAGE_KEY);
        } catch { /* storage unavailable */ }
    }

    // Measured with a monotonic clock: the wall clock can jump.
    function createRetryWindow({ windowMs = 120000, now = () => performance.now() } = {}) {
        let startedAt = null;
        return {
            start() { if (startedAt === null) startedAt = now(); },
            expired() { return startedAt !== null && now() - startedAt >= windowMs; },
            stop() { startedAt = null; }
        };
    }

    // Reconnects with backoff until the retry window runs out, then gives up.
    function createReconnector({ reopen, onWait, onGiveUp, ...windowOptions }) {
        const retry = createRetryWindow(windowOptions);
        const backoff = window.ScrumPokerReconnect.createBackoff({ baseMs: 1000, maxMs: 15000 });
        let active = false;
        let timer = null;

        function stop() {
            active = false;
            retry.stop();
            backoff.reset();
            clearTimeout(timer);
        }

        function schedule() {
            if (retry.expired()) return onGiveUp();
            onWait();
            clearTimeout(timer);
            timer = setTimeout(reopen, backoff.next());
        }

        return {
            begin() { active = true; retry.start(); },
            active: () => active,
            schedule,
            stop
        };
    }

    window.ScrumPokerGuestSession = { load, save, clear, createRetryWindow, createReconnector };
})(window);
