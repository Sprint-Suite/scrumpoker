(function attachFacilitatorControls(window) {
    const MAX_FACILITATORS = 2; // mirrors lib/roles.js
    const ROLE_ERROR_MS = 3000;
    const ELEMENT_IDS = {
        controls: 'facilitator-controls',
        showVotes: 'show-votes-button',
        nextRound: 'start-next-round-button',
        reset: 'reset-votes-button',
        inviteButton: 'invite-menu-button',
        inviteMenu: 'invite-menu',
        copyInvite: 'copy-invite-link-button',
        endButton: 'end-session-button',
        endModal: 'end-session-modal',
        endError: 'end-session-error',
        endConfirm: 'confirm-end-session-button',
        endCancel: 'cancel-end-session-button',
        roleError: 'role-error'
    };

    const isFacilitator = (ctx) => ctx.state.currentUser?.role === 'Facilitator';

    function collectElements(document) {
        const els = {};
        Object.entries(ELEMENT_IDS).forEach(([key, id]) => {
            els[key] = document.getElementById(id);
        });
        return els;
    }

    function render(ctx, state) {
        const { els } = ctx;
        ctx.state = state;
        ctx.pendingRoleChange = false;
        const facilitator = isFacilitator(ctx);
        els.controls.classList.toggle('hidden', !facilitator);
        els.inviteButton.classList.toggle('hidden', !facilitator);
        els.endButton.classList.toggle('hidden', !facilitator);
        els.nextRound.classList.toggle('hidden', !facilitator || !state.votesRevealed);
        if (!facilitator) {
            closeInviteMenu(ctx);
            return;
        }
        els.showVotes.disabled = state.votesRevealed;
        els.nextRound.disabled = !state.votesRevealed;
        els.reset.disabled = false;
    }

    function showRoleError(ctx, message) {
        const { roleError } = ctx.els;
        roleError.textContent = message;
        roleError.classList.remove('hidden');
        clearTimeout(ctx.roleErrorTimer);
        ctx.roleErrorTimer = setTimeout(() => roleError.classList.add('hidden'), ROLE_ERROR_MS);
    }

    function isEndModalOpen(ctx) {
        return !ctx.els.endModal.classList.contains('hidden');
    }

    function resetEndButton(ctx) {
        ctx.els.endConfirm.disabled = false;
        ctx.els.endConfirm.textContent = 'End Session';
    }

    function handleError(ctx, message) {
        if (isEndModalOpen(ctx)) {
            ctx.els.endError.textContent = message;
            ctx.els.endError.classList.remove('hidden');
            resetEndButton(ctx);
            return true;
        }
        if (ctx.pendingRoleChange) {
            ctx.pendingRoleChange = false;
            showRoleError(ctx, message);
            return true;
        }
        return false;
    }

    function isInviteMenuOpen(ctx) {
        return !ctx.els.inviteMenu.classList.contains('hidden');
    }

    function closeInviteMenu(ctx) {
        ctx.els.inviteMenu.classList.add('hidden');
        ctx.els.inviteButton.setAttribute('aria-expanded', 'false');
    }

    function toggleInviteMenu(ctx, event) {
        event.stopPropagation();
        if (isInviteMenuOpen(ctx)) {
            closeInviteMenu(ctx);
        } else if (isFacilitator(ctx)) {
            ctx.els.inviteMenu.classList.remove('hidden');
            ctx.els.inviteButton.setAttribute('aria-expanded', 'true');
        }
    }

    function closeEndModal(ctx) {
        ctx.els.endModal.classList.add('hidden');
        ctx.els.endError.classList.add('hidden');
        resetEndButton(ctx);
    }

    function openEndModal(ctx) {
        if (!isFacilitator(ctx)) return;
        ctx.els.endError.classList.add('hidden');
        resetEndButton(ctx);
        ctx.els.endModal.classList.remove('hidden');
    }

    function confirmEndSession(ctx) {
        if (!isFacilitator(ctx)) return;
        ctx.els.endError.classList.add('hidden');
        ctx.els.endConfirm.disabled = true;
        ctx.els.endConfirm.textContent = 'Ending...';
        ctx.send('endSession', {});
    }

    async function copyInvite(ctx, event) {
        if (!isFacilitator(ctx)) return;
        const button = event.currentTarget;
        const { shareToken } = ctx.state;
        if (!shareToken) {
            showRoleError(ctx, 'Invite link unavailable. Rejoin the room and try again.');
            return;
        }
        const originalText = button.textContent.trim();
        button.disabled = true;
        try {
            await ctx.copyText(`${window.location.origin}/join?token=${shareToken}`);
            button.textContent = 'Copied invite link';
        } catch (_err) {
            button.textContent = 'Copy failed';
        } finally {
            setTimeout(() => {
                button.disabled = false;
                button.textContent = originalText;
            }, 1600);
        }
    }

    function showVotes(ctx) {
        if (isFacilitator(ctx) && !ctx.state.votesRevealed) ctx.send('revealVotes', {});
    }

    function startNextRound(ctx) {
        if (!isFacilitator(ctx) || !ctx.state.votesRevealed) return;
        ctx.els.nextRound.disabled = true;
        ctx.send('startNextRound', {});
    }

    function resetVotes(ctx) {
        if (!isFacilitator(ctx)) return;
        ctx.els.reset.disabled = true;
        ctx.onReset(() => ctx.send('resetVotes', {}));
    }

    function roleSelectFor(ctx, participant, state) {
        const { currentUser, facilitatorIds } = state;
        if (currentUser?.role !== 'Facilitator' || participant.id === currentUser.id) return null;
        const select = ctx.document.createElement('select');
        select.classList.add('participant-role-select');
        // A full facilitator list only offers the role to those already holding it.
        const canGrant = facilitatorIds.length < MAX_FACILITATORS || facilitatorIds.includes(participant.id);
        (canGrant ? ['Voter', 'Observer', 'Facilitator'] : ['Voter', 'Observer']).forEach((role) => {
            const option = ctx.document.createElement('option');
            option.value = role;
            option.textContent = role;
            option.selected = role === participant.role;
            select.appendChild(option);
        });
        select.addEventListener('change', (e) => {
            ctx.pendingRoleChange = true;
            ctx.send('changeRole', { targetUserId: participant.id, newRole: e.target.value });
        });
        return select;
    }

    function bindEvents(ctx) {
        const { els, document } = ctx;
        els.showVotes.addEventListener('click', () => showVotes(ctx));
        els.nextRound.addEventListener('click', () => startNextRound(ctx));
        els.reset.addEventListener('click', () => resetVotes(ctx));
        els.inviteButton.addEventListener('click', (e) => toggleInviteMenu(ctx, e));
        els.copyInvite.addEventListener('click', (e) => copyInvite(ctx, e));
        els.endButton.addEventListener('click', () => openEndModal(ctx));
        els.endConfirm.addEventListener('click', () => confirmEndSession(ctx));
        els.endCancel.addEventListener('click', () => closeEndModal(ctx));
        document.addEventListener('click', (e) => {
            if (!isInviteMenuOpen(ctx) || els.inviteMenu.contains(e.target) || els.inviteButton.contains(e.target)) return;
            closeInviteMenu(ctx);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !isInviteMenuOpen(ctx)) return;
            closeInviteMenu(ctx);
            els.inviteButton.focus();
        });
    }

    function createFacilitatorControls({ document, send, copyText, onReset = (sendReset) => sendReset() }) {
        const ctx = {
            document,
            send,
            copyText,
            onReset,
            els: collectElements(document),
            state: { currentUser: null, votesRevealed: false, facilitatorIds: [], shareToken: null },
            pendingRoleChange: false,
            roleErrorTimer: null
        };
        bindEvents(ctx);
        return {
            render: (state) => render(ctx, state),
            roleSelectFor: (participant, state) => roleSelectFor(ctx, participant, state),
            handleError: (message) => handleError(ctx, message),
            closeAll: () => {
                closeInviteMenu(ctx);
                closeEndModal(ctx);
            }
        };
    }

    window.ScrumPokerFacilitator = { createFacilitatorControls };
})(window);
