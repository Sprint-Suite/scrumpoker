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

    // Reconnects with backoff. A deadline armed by the first begin() gives up
    // even if a reopened socket never opens and never closes.
    function createReconnector(options) {
        const { reopen, onWait, onGiveUp, windowMs = 120000, now } = options;
        const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
        const clearTimer = options.clearTimer || ((id) => clearTimeout(id));
        const retry = createRetryWindow({ windowMs, now });
        const backoff = window.ScrumPokerReconnect.createBackoff({ baseMs: 1000, maxMs: 15000 });
        let active = false;
        let timer = null;
        let deadline = null;

        function stop() {
            active = false;
            retry.stop();
            backoff.reset();
            clearTimer(timer);
            clearTimer(deadline);
        }

        function giveUp() {
            if (!active) return;
            stop();
            onGiveUp();
        }

        function begin() {
            if (active) return;
            active = true;
            retry.start();
            deadline = setTimer(giveUp, windowMs);
        }

        function schedule() {
            if (!active) return;
            if (retry.expired()) return giveUp();
            onWait();
            clearTimer(timer);
            timer = setTimer(reopen, backoff.next());
        }

        return { begin, active: () => active, schedule, stop };
    }

    window.ScrumPokerGuestSession = { load, save, clear, createRetryWindow, createReconnector };
})(window);
