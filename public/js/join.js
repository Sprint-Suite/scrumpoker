(function () {
    'use strict';

    // --- Constants ---
    const fibonacciVotes = ['0', '1', '2', '3', '5', '8', '13', '?'];
    const cardDeck = window.ScrumPokerCardDeck;
    const voteResults = window.ScrumPokerVoteResults;

    // --- DOM Elements ---
    const joinSection = document.getElementById('join-section');
    const pokerRoomSection = document.getElementById('poker-room-section');
    const joinNameInput = document.getElementById('join-name-input');
    const joinButton = document.getElementById('join-button');
    const joinError = document.getElementById('join-error');
    const connectionStatus = document.getElementById('connection-status');
    const userGreeting = document.getElementById('user-greeting');
    const roomDisplay = document.getElementById('room-display');
    const votingCardsContainer = document.getElementById('voting-cards');
    const observerMessage = document.getElementById('observer-message');
    const voteError = document.getElementById('vote-error');
    const participantsListContainer = document.getElementById('participants-list');
    const roundStatus = document.getElementById('round-status');

    // --- Card animator ---
    const cardAnimator = cardDeck.createCardAnimator({
        getCards: () => votingCardsContainer.querySelectorAll('.vote-card .card-inner')
    });

    // --- Facilitator controls ---
    function send(type, payload) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, payload }));
    }
    const controls = window.ScrumPokerFacilitator.createFacilitatorControls({
        document,
        send,
        copyText: window.ScrumPokerClipboard.copyText
    });

    // --- Application State ---
    let ws = null;
    let everOpened = false;
    let myId = null;
    let participants = [];
    let votesRevealed = false;
    let roomName = null;
    let currentUser = null;
    let animateVotingCards = true;
    let voteErrorTimer = null;
    let ended = false;
    let facilitatorIds = [];
    let shareToken = null;

    // --- Read token from URL ---
    const token = new URLSearchParams(window.location.search).get('token');

    // --- Helpers ---
    function showJoinError(message) {
        joinError.textContent = message;
        joinError.classList.remove('hidden');
    }

    function hideJoinError() {
        joinError.classList.add('hidden');
    }

    function showVoteError(message) {
        voteError.textContent = message;
        voteError.classList.remove('hidden');
        if (voteErrorTimer) clearTimeout(voteErrorTimer);
        voteErrorTimer = setTimeout(() => {
            voteError.classList.add('hidden');
            voteErrorTimer = null;
        }, 3000);
    }

    function updateConnectionStatus(cssClass, text) {
        connectionStatus.className = cssClass;
        connectionStatus.textContent = text;
    }

    function showRoomSection() {
        joinSection.classList.add('hidden');
        pokerRoomSection.classList.remove('hidden');
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    function showJoinSection() {
        controls.closeAll();
        joinSection.classList.remove('hidden');
        pokerRoomSection.classList.add('hidden');
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    // --- Validate token on load ---
    if (!token) {
        showJoinError('This invite link is invalid.');
        joinButton.disabled = true;
    }

    // --- WebSocket ---
    function openWebSocket(name) {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`;

        updateConnectionStatus('connecting', 'Connecting...');
        joinButton.disabled = true;

        // Drop any prior socket so its onclose can't fire a second reconnect path.
        if (ws) { ws.onclose = null; ws.close(); }
        everOpened = false;
        ws = new WebSocket(url);

        ws.onopen = () => {
            everOpened = true;
            updateConnectionStatus('connecting', 'Connecting...');
            ws.send(JSON.stringify({ type: 'login', payload: { name } }));
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleServerMessage(message);
            } catch (err) {
                console.error('Failed to parse server message:', event.data, err);
            }
        };

        ws.onerror = () => {
            updateConnectionStatus('disconnected', 'Connection error');
        };

        ws.onclose = (event) => {
            if (ended) return;
            updateConnectionStatus('disconnected', 'Disconnected');
            showJoinSection();
            joinButton.disabled = false;
            if (!everOpened) {
                // A refused upgrade could be a closed room or a busy server; the page cannot tell which.
                showJoinError('This room may have closed, or the server is busy. Try again in a moment.');
            } else if (event.code === 1008) {
                showJoinError('Disconnected for sending too many messages. Please try rejoining.');
            } else {
                showJoinError('Disconnected. Please try rejoining.');
            }
        };
    }

    // --- Server Message Handler ---
    function handleServerMessage(message) {
        const { type, payload } = message;

        switch (type) {
            case 'yourId':
                if (payload && payload.id) {
                    myId = payload.id;
                }
                break;

            case 'updateState': {
                if (!payload) break;
                const wasRevealedInRoom = votesRevealed && !pokerRoomSection.classList.contains('hidden');
                participants = payload.participants || [];
                votesRevealed = payload.votesRevealed || false;
                roomName = payload.displayName || null;
                facilitatorIds = payload.facilitatorIds || [];
                shareToken = payload.shareToken || null;

                if (myId) {
                    currentUser = participants.find(p => p.id === myId) || null;
                }

                if (currentUser) {
                    updateConnectionStatus('connected', 'Connected');
                    showRoomSection();
                    if (wasRevealedInRoom && !votesRevealed) {
                        // Votes were reset: flip the old cards down, then deal the new round.
                        cardAnimator.animateCardsFaceDownBeforeReset(() => {
                            animateVotingCards = true;
                            updateUI();
                        });
                    } else {
                        updateUI();
                    }
                }
                break;
            }

            case 'error': {
                const errorMessage = payload?.message || 'Something went wrong.';
                console.error('Server error:', errorMessage);
                if (/closed|invalid|expired/i.test(errorMessage)) {
                    // Fatal link/room error — show on entry screen
                    showJoinSection();
                    showJoinError(errorMessage);
                    joinButton.disabled = false;
                } else {
                    renderParticipantsList();
                    if (!controls.handleError(errorMessage)) showVoteError(errorMessage);
                }
                break;
            }

            case 'sessionEnded': {
                ended = true;
                if (ws) ws.close();
                updateConnectionStatus('disconnected', 'Session ended');
                showJoinSection();
                const msg = payload?.message || 'The facilitator ended this session.';
                showJoinError(msg);
                joinButton.disabled = true;
                break;
            }

            default:
                break;
        }
    }

    // --- UI Rendering ---
    function updateUI() {
        if (!currentUser) return;

        roomDisplay.textContent = roomName ? `Room: ${roomName}` : '';
        userGreeting.textContent = `Joined as ${currentUser.name}`;
        renderRoundStatus();
        renderVotingCards();
        renderParticipantsList();
        controls.render({ currentUser, votesRevealed, facilitatorIds, shareToken });
        voteResults.renderResults({ document, participants, votesRevealed });
    }

    function renderRoundStatus() {
        roundStatus.textContent = votesRevealed ? 'Revealed' : 'Open';
        roundStatus.classList.toggle('is-locked', votesRevealed);
    }

    function renderVotingCards() {
        cardAnimator.clear();

        votingCardsContainer.innerHTML = '';
        votingCardsContainer.appendChild(observerMessage);

        fibonacciVotes.forEach(value => {
            const cardButton = cardDeck.createVotingCard({
                document,
                value,
                selected: currentUser?.vote === value,
                disabled: votesRevealed,
                onClick: votesRevealed ? null : handleVote
            });
            votingCardsContainer.appendChild(cardButton);
        });

        if (!votesRevealed && animateVotingCards) {
            cardAnimator.animateCardsIntoView();
            animateVotingCards = false;
        }
    }

    function renderParticipantsList() {
        participantsListContainer.innerHTML = '';

        const sorted = [...participants].sort((a, b) => {
            if (a.id === myId) return -1;
            if (b.id === myId) return 1;
            return a.name.localeCompare(b.name);
        });

        sorted.forEach(participant => {
            const div = document.createElement('div');
            div.classList.add('participant-row');

            const nameRoleDiv = document.createElement('div');
            nameRoleDiv.classList.add('participant-info');

            const nameSpan = document.createElement('span');
            nameSpan.classList.add('participant-name');
            nameSpan.textContent = participant.name;
            if (participant.id === myId) {
                nameSpan.textContent += ' (You)';
                nameSpan.classList.add('is-current-user');
            }
            nameRoleDiv.appendChild(nameSpan);

            const roleSpan = document.createElement('span');
            roleSpan.classList.add('participant-role');
            roleSpan.textContent = `(${participant.role})`;
            nameRoleDiv.appendChild(roleSpan);

            const roleControl = controls.roleSelectFor(participant, { currentUser, facilitatorIds });
            if (roleControl) {
                const controlsDiv = document.createElement('div');
                controlsDiv.classList.add('participant-role-controls');
                controlsDiv.appendChild(roleControl);
                nameRoleDiv.appendChild(controlsDiv);
            }

            div.appendChild(nameRoleDiv);

            // Vote card
            const voteContainer = document.createElement('div');
            voteContainer.classList.add('card-container', 'participant-vote');
            voteContainer.dataset.userId = participant.id;

            const card = document.createElement('div');
            card.classList.add('flip-card');
            if (votesRevealed && participant.vote !== null) {
                card.classList.add('flipped');
            }

            const cardFaceFront = document.createElement('div');
            cardFaceFront.classList.add('card-face', 'card-front');
            cardFaceFront.textContent = '♢';

            const cardFaceBack = document.createElement('div');
            cardFaceBack.classList.add('card-face', 'card-back');
            cardFaceBack.textContent = (votesRevealed && participant.vote !== null) ? participant.vote : '--';
            if (votesRevealed && participant.vote !== null) {
                cardFaceBack.classList.add('vote-sticker', 'revealed-sticker');
            }

            card.appendChild(cardFaceFront);
            card.appendChild(cardFaceBack);
            voteContainer.appendChild(card);

            if (!votesRevealed && participant.vote !== null && participant.role !== 'Observer') {
                const checkMark = document.createElement('span');
                checkMark.textContent = '✓';
                checkMark.classList.add('vote-checkmark');
                voteContainer.appendChild(checkMark);
            }

            div.appendChild(voteContainer);
            participantsListContainer.appendChild(div);
        });
    }

    // --- Vote Handler ---
    function handleVote(event) {
        if (votesRevealed) return;
        const selectedValue = event.currentTarget.dataset.value;
        send('vote', { vote: selectedValue });
        document.querySelectorAll('.vote-card').forEach(btn => btn.classList.remove('selected', 'picked'));
        const picked = event.currentTarget;
        picked.classList.add('selected', 'picked', 'placed');
        picked.addEventListener('animationend', () => picked.classList.remove('placed'), { once: true });
    }

    // --- Join Action ---
    function handleJoin() {
        if (!token) return;
        const name = joinNameInput.value.trim();
        if (!name) {
            showJoinError('Please enter your name.');
            return;
        }
        hideJoinError();
        openWebSocket(name);
    }

    // --- Event Listeners ---
    joinButton.addEventListener('click', handleJoin);
    joinNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !joinButton.disabled) handleJoin();
    });

})();
