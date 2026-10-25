
 
 // --- DOM Elements --- ****
 const loginSection = document.getElementById('login-section');
 const roomDisplay = document.getElementById('room-display');
 const roomOrg = document.getElementById('room-org');
 const pokerRoomSection = document.getElementById('poker-room-section');
 const nameInput = document.getElementById('name-input');
 const roomInput = document.getElementById('room-input');
 const roleSelect = document.getElementById('role-select');
 const nameField = document.getElementById('name-field');
 const roomField = document.getElementById('room-field');
 const loginButton = document.getElementById('login-button');
 const loginError = document.getElementById('login-error');
 const userGreeting = document.getElementById('user-greeting');
 const votingCardsContainer = document.getElementById('voting-cards');
 const observerMessage = document.getElementById('observer-message');
 const voteError = document.getElementById('vote-error');
 const participantsListContainer = document.getElementById('participants-list');
 const facilitatorControls = document.getElementById('facilitator-controls');
 const showVotesButton = document.getElementById('show-votes-button');
 const startNextRoundButton = document.getElementById('start-next-round-button');
 const resetVotesButton = document.getElementById('reset-votes-button');
 const voteSummary = document.getElementById('vote-summary');
 const averageVoteSpan = document.getElementById('average-vote');
 const roundStatus = document.getElementById('round-status');
 const inviteMenuButton = document.getElementById('invite-menu-button');
 const inviteMenu = document.getElementById('invite-menu');
 const copyInviteLinkButton = document.getElementById('copy-invite-link-button');
 const endSessionButton = document.getElementById('end-session-button');
 const logoutButton = document.getElementById('logout-button');

 const editRoleButton = document.getElementById('edit-role-button');
 const editRoleModal  = document.getElementById('edit-role-modal');
 const editRoleSelect = document.getElementById('edit-role-select');
 const editRoleError  = document.getElementById('edit-role-error');
 const saveRoleButton   = document.getElementById('save-role-button');
 const cancelEditRoleButton = document.getElementById('cancel-edit-role-button');
 const endSessionModal = document.getElementById('end-session-modal');
 const endSessionError = document.getElementById('end-session-error');
 const confirmEndSessionButton = document.getElementById('confirm-end-session-button');
 const cancelEndSessionButton = document.getElementById('cancel-end-session-button');

 const connectionStatus = document.getElementById('connection-status');

// Card dealer


 let animateVotingCards = true; // Controls whether cards animate in
 let voteErrorTimer = null;
 let resetFaceDownBeforeStateUpdate = false;
 const cardDeck = window.ScrumPokerCardDeck;
 const cardAnimator = cardDeck.createCardAnimator({
     getCards: () => votingCardsContainer.querySelectorAll('.vote-card .card-inner')
 });
 const ROOM_SESSION_STORAGE = 'scrumPokerRoomSession';
 const ROOM_RECONNECT_STORAGE = 'scrumPokerReconnectToRoom';
 // --- Application State (Managed primarily by server now) ---
 let currentCompany = null; // Company fetched from /api/me — kept module-scoped for room-header display
 let currentShareToken = null; // Per-room anonymous share token received from server
 let currentUser = null; // { id: string, name: string, role: 'Voter' | 'Facilitator' | 'Observer', vote: string | null }
 let currentRoom = null;   // ← NEW: will hold the room name after login
 let participants = []; // Array of user objects received from server
 let votesRevealed = false; // Status received from server
 const MAX_FACILITATORS = 2; // mirrors lib/roles.js
 let facilitatorIds = []; // IDs received from server
 let pendingLoginContext = null;
 let pendingLoginSource = '';
 let connectionState = 'connecting'; // 'connecting' | 'connected' | 'error' | 'disconnected'
 let allowStoredRoomRestore = true;
 let attemptedStoredRoomRestore = false;
 const fibonacciVotes = ['0', '1', '2', '3', '5', '8', '13', '?']; // Voting options


 // --- WebSocket Setup ---
 let ws = null;
 let everOpened = false;
 const reconnect = window.ScrumPokerReconnect;
 const reconnectBackoff = reconnect.createBackoff();

// Dynamically determine WebSocket URL from the current page origin.

const loc = window.location;
const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
const WEBSOCKET_URL = `${protocol}//${loc.host}/ws`;


const LOGIN_BUTTON_SUFFIX = {
    connecting: ' (Connecting...)',
    connected: '',
    error: ' (Error)',
    disconnected: ' (Disconnected)'
};

function refreshLoginButton() {
    loginButton.textContent = `Enter Room${LOGIN_BUTTON_SUFFIX[connectionState] || ''}`;
    loginButton.disabled = connectionState !== 'connected';
}

function setConnectionState(state) {
    connectionState = state;
    refreshLoginButton();
}


 function connectWebSocket() {
     updateConnectionStatus('connecting', 'Connecting...');
     setConnectionState('connecting');
     loginError.classList.add('hidden'); // Hide previous errors

     ws = new WebSocket(WEBSOCKET_URL);

     ws.onopen = () => {
         everOpened = true;
         updateConnectionStatus('connected', 'Connected');
         setConnectionState('connected');

         showLogin(); // Show login screen for first time connection
         if (restoreDisconnectedRoomSession()) return;
     };

     ws.onmessage = (event) => {
         try {
             const message = JSON.parse(event.data);
             handleServerMessage(message);
         } catch (error) {
             console.error('Failed to parse server message:', event.data, error);
         }
     };

     ws.onerror = (error) => {
         console.error('WebSocket error:', error);
         updateConnectionStatus('disconnected', 'Connection Error');
         setConnectionState('error');
         showLogin({ clearError: false }); // Force back to login on connection error
         showLoginError('Cannot connect to the server. Please try again later.');
     };

     ws.onclose = (event) => {
         if (!everOpened) {
             handleRefusedConnection();
             return;
         }
         everOpened = false;
         markRoomReconnectIntent();
         updateConnectionStatus('disconnected', 'Disconnected');
         setConnectionState('disconnected');
         currentUser = null; // Clear user state
         participants = [];
         showLogin({ clearError: false }); // Go back to login screen
         showLoginError(event.code === 1008 ? 'Too many messages. Reconnecting...' : 'Connection lost. Reconnecting...');
         setTimeout(connectWebSocket, reconnectBackoff.next());
     };
 }

 async function handleRefusedConnection() {
     if (await reconnect.probeAccess(window.fetch.bind(window)) === 'reauth') {
         showLoginError('Your session has ended or this account has no access — re-launch poker from the hub.');
         setTimeout(() => window.location.reload(), 1500);
         return;
     }
     updateConnectionStatus('disconnected', 'Server busy');
     setConnectionState('disconnected');
     showLoginError('The server is busy. Retrying...');
     setTimeout(connectWebSocket, reconnectBackoff.next());
 }

 function updateConnectionStatus(status, text) {
     connectionStatus.className = status; // 'connected', 'disconnected', 'connecting'
     connectionStatus.textContent = text;
 }

function isLoginVisible() {
    return !loginSection.classList.contains('hidden');
}

function isRoomVisible() {
    return !pokerRoomSection.classList.contains('hidden');
}

function showLoginError(message) {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
}

function hideLoginError() {
    loginError.classList.add('hidden');
}

function showVoteError(message) {
    voteError.textContent = message;
    voteError.classList.remove('hidden');

    if (voteErrorTimer) {
        clearTimeout(voteErrorTimer);
    }

    voteErrorTimer = setTimeout(() => {
        voteError.classList.add('hidden');
        voteErrorTimer = null;
    }, 3000);
}

 // --- Server Message Handler ---
 function handleServerMessage(message) {
     const { type, payload } = message;

     switch (type) {
         case 'yourId':
             reconnectBackoff.reset();
             // Store the ID assigned by the server
             if (payload && payload.id) {
                  // We don't set currentUser here yet, wait for login success / state update
                  sessionStorage.setItem('scrumPokerUserId_temp', payload.id); // Store temporarily until login
             }
             break;

         case 'updateState':
             if (payload) {
                 const wasVotesRevealed = votesRevealed;
                 const wasRoomVisible = isRoomVisible();
                 participants = payload.participants || [];
                 votesRevealed = payload.votesRevealed || false;
                 facilitatorIds = payload.facilitatorIds || [];
                 currentShareToken = payload.shareToken || null;
                 pokerRoomSection.dataset.shareToken = currentShareToken || '';

                 // Find the current user in the updated participant list
                const myTempId    = sessionStorage.getItem('scrumPokerUserId_temp');
                const mySessionId = sessionStorage.getItem('scrumPokerUserId');
                // Use stored session-id only if it still matches someone in the room; otherwise use temp:
                const myId = participants.some(p => p.id === mySessionId) ? mySessionId : myTempId;

                 if (myId) {
                    currentUser = participants.find(p => p.id === myId) || null;
                 } else {
                     currentUser = null; // Should not happen if connected/logged in
                 }


                 // If currentUser exists, we are in the room, otherwise stay/go to login
                 if (currentUser) {
                     // Update session storage with potentially changed details (like role)
                     sessionStorage.setItem('scrumPokerUserId', currentUser.id);
                     sessionStorage.setItem('scrumPokerUserName', currentUser.name);
                     persistRoomSession();
                     pendingLoginContext = null;
                     pendingLoginSource = '';

                    const isEnteringRoom = !pokerRoomSection || pokerRoomSection.classList.contains('hidden');
                    const didResetVotes = wasVotesRevealed &&
                        !votesRevealed &&
                        wasRoomVisible &&
                        !isEnteringRoom;
                    const shouldAnimateResetDeck = didResetVotes && !resetFaceDownBeforeStateUpdate;

                    if (isEnteringRoom) {
                        // Only entering the room for the first time!
                        animateVotingCards = true;
                    }



                     showPokerRoom(); // Ensure poker room is visible
                     if (shouldAnimateResetDeck) {
                         cardAnimator.animateCardsFaceDownBeforeReset(() => {
                             animateVotingCards = true;
                             updateUI();
                         });
                     } else {
                         if (didResetVotes) {
                             resetFaceDownBeforeStateUpdate = false;
                         }
                         updateUI(); // Update the UI with the new state
                     }
                 } else if (!loginSection.classList.contains('hidden')) {
                     // Still on login screen, do nothing until login action
                 } else {
                     // Was in room, but now not in participant list (e.g., kicked?)
                     logout(); // Go back to login
                 }
             }
             break;

         case 'sessionEnded':
             handleSessionEnded(payload?.message || 'Session ended by facilitator.');
             break;

         case 'error':
             const errorMessage = payload?.message || 'Something went wrong.';
             console.error('Server Error:', errorMessage);
             if (pendingLoginContext) {
                 if (pendingLoginSource === 'stored' || pendingLoginSource === 'reconnect') {
                     clearRoomSession();
                 }
                 pendingLoginContext = null;
                 pendingLoginSource = '';
                 refreshLoginButton();
             }
             if (isRoomVisible()) {
                 if (isEndSessionModalOpen()) {
                     showEndSessionError(errorMessage);
                     resetEndSessionButton();
                 } else {
                     showVoteError(errorMessage);
                 }
             } else if (isLoginVisible()) {
                 showLoginError(errorMessage);
             } else {
                 showLogin({ clearError: false });
                 showLoginError(errorMessage);
             }
             break;

         default:
             break;
     }
 }

 // --- Send Message Helper ---
 function sendMessage(type, payload) {
     if (ws && ws.readyState === WebSocket.OPEN) {
         const message = JSON.stringify({ type, payload });
         ws.send(message);
     } else {
         console.error('WebSocket is not connected. Cannot send message.');
          updateConnectionStatus('disconnected', 'Disconnected');
          showLogin({ clearError: false });
          showLoginError('Connection lost. Please wait while the app reconnects.');
     }
 }

function getValidRole(value) {
    return Array.from(roleSelect.options).some((option) => option.value === value) ? value : '';
}

function clearRoomSession() {
    sessionStorage.removeItem(ROOM_SESSION_STORAGE);
    sessionStorage.removeItem(ROOM_RECONNECT_STORAGE);
}

function getStoredRoomSession() {
    try {
        const stored = JSON.parse(sessionStorage.getItem(ROOM_SESSION_STORAGE) || 'null');
        if (
            stored &&
            typeof stored.room === 'string' &&
            typeof stored.name === 'string' &&
            getValidRole(stored.role)
        ) {
            return stored;
        }
    } catch (_err) {
        // Ignore malformed session data and fall back to the login screen.
    }

    clearRoomSession();
    return null;
}

function saveRoomSession(session) {
    sessionStorage.setItem(ROOM_SESSION_STORAGE, JSON.stringify({
        room: session.room,
        name: session.name,
        role: session.role
    }));
}

function persistRoomSession() {
    const storedSession = getStoredRoomSession();
    const session = pendingLoginContext || storedSession;
    if (!session || !currentUser || !currentRoom) return;

    saveRoomSession({
        ...session,
        room: currentRoom,
        name: currentUser.name,
        role: currentUser.role
    });
}

function fillLoginFromStoredSession(storedSession) {
    roomInput.value = storedSession.room;
    nameInput.value = storedSession.name;
    roleSelect.value = storedSession.role;
    currentRoom = storedSession.room;
}

function sendStoredLogin(storedSession, source) {
    fillLoginFromStoredSession(storedSession);
    pendingLoginContext = storedSession;
    pendingLoginSource = source;
    sendMessage('login', storedSession);
}

function restoreDisconnectedRoomSession() {
    if (!allowStoredRoomRestore) return false;
    if (sessionStorage.getItem(ROOM_RECONNECT_STORAGE) !== '1') return false;

    sessionStorage.removeItem(ROOM_RECONNECT_STORAGE);
    const storedSession = getStoredRoomSession();
    if (!storedSession) return false;

    showLoginError('Reconnected. Rejoining room...');
    sendStoredLogin(storedSession, 'reconnect');
    return true;
}

function markRoomReconnectIntent() {
    if (!currentUser || !currentRoom) return;

    persistRoomSession();
    if (getStoredRoomSession()) {
        sessionStorage.setItem(ROOM_RECONNECT_STORAGE, '1');
    }
}


 // --- Company Loader ---
 async function loadCompany() {
     try {
         const res = await fetch('/api/me', { credentials: 'same-origin' });
         if (!res.ok) { window.location.reload(); return; }
         const { company = null } = await res.json();
         currentCompany = company;
         if (isRoomVisible()) updateUI();
     } catch {
         showLoginError('Could not load your account. Re-launch poker from the hub.');
     }
 }

 // --- Initialization ---
 function init() {
     const appliedInvitePrefill = applyInvitePrefill();
     allowStoredRoomRestore = !appliedInvitePrefill;
     setupEventListeners();
     connectWebSocket(); // Start WebSocket connection attempt
     loadCompany();      // Load company info from hub
 }

 function applyInvitePrefill() {
     const params = new URLSearchParams(window.location.search);
     const invitedRoom = params.get('room');
     const invitedRole = params.get('role');
     let appliedPrefill = false;

     if (invitedRoom) {
         roomInput.value = invitedRoom;
         appliedPrefill = true;
     }

     if (invitedRole && Array.from(roleSelect.options).some((option) => option.value === invitedRole)) {
         roleSelect.value = invitedRole;
         appliedPrefill = true;
     }

     if (appliedPrefill && window.history.replaceState) {
         window.history.replaceState(null, document.title, window.location.pathname);
     }

     return appliedPrefill;
 }

 // --- Event Listeners ---
 function setupEventListeners() {
     loginButton.addEventListener('click', handleLogin);
     nameInput.addEventListener('keypress', (e) => {
         if (e.key === 'Enter' && !loginButton.disabled) handleLogin();
     });
     roomInput.addEventListener('keypress', (e) => {
         if (e.key === 'Enter' && !loginButton.disabled) handleLogin();
     });
     showVotesButton.addEventListener('click', handleShowVotes);
     startNextRoundButton.addEventListener('click', handleStartNextRound);
     resetVotesButton.addEventListener('click', handleResetVotes);

     inviteMenuButton.addEventListener('click', toggleInviteMenu);
     copyInviteLinkButton.addEventListener('click', handleCopyRoomInvite);
     endSessionButton.addEventListener('click', openEndSessionModal);
     confirmEndSessionButton.addEventListener('click', handleConfirmEndSession);
     cancelEndSessionButton.addEventListener('click', closeEndSessionModal);
     logoutButton.addEventListener('click', logout);

     // Replace the old event binding:
     editRoleButton.addEventListener('click', openEditRoleModal);
     saveRoleButton.addEventListener('click', handleSaveRole);
     cancelEditRoleButton.addEventListener('click', closeEditRoleModal);
     document.addEventListener('click', handleDocumentClick);
     document.addEventListener('keydown', handleDocumentKeydown);
 }

 function isInviteMenuOpen() {
     return !inviteMenu.classList.contains('hidden');
 }

 function openInviteMenu() {
     if (currentUser?.role !== 'Facilitator') return;
     inviteMenu.classList.remove('hidden');
     inviteMenuButton.setAttribute('aria-expanded', 'true');
 }

 function closeInviteMenu() {
     inviteMenu.classList.add('hidden');
     inviteMenuButton.setAttribute('aria-expanded', 'false');
 }

 function toggleInviteMenu(event) {
     event.stopPropagation();
     if (isInviteMenuOpen()) {
         closeInviteMenu();
     } else {
         openInviteMenu();
     }
 }

 function handleDocumentClick(event) {
     if (!isInviteMenuOpen()) return;
     if (inviteMenu.contains(event.target) || inviteMenuButton.contains(event.target)) return;
     closeInviteMenu();
 }

 function handleDocumentKeydown(event) {
     if (event.key === 'Escape' && isInviteMenuOpen()) {
         closeInviteMenu();
         inviteMenuButton.focus();
     }
 }

 // Function to open modal and pre‐select current role
 function openEditRoleModal() {
 if (!currentUser) return;
 // Only an existing facilitator holds that role; members cannot take it themselves.
 const facilitatorOption = editRoleSelect.querySelector('option[value="Facilitator"]');
 facilitatorOption.hidden = currentUser.role !== 'Facilitator';
 facilitatorOption.disabled = currentUser.role !== 'Facilitator';
 editRoleSelect.value = currentUser.role;
 editRoleError.classList.add('hidden');
 editRoleModal.classList.remove('hidden');
 }
 function closeEditRoleModal() {
 editRoleModal.classList.add('hidden');
 }

 function isEndSessionModalOpen() {
     return !endSessionModal.classList.contains('hidden');
 }

 function resetEndSessionButton() {
     confirmEndSessionButton.disabled = false;
     confirmEndSessionButton.textContent = 'End Session';
 }

 function showEndSessionError(message) {
     endSessionError.textContent = message;
     endSessionError.classList.remove('hidden');
 }

 function openEndSessionModal() {
     if (currentUser?.role !== 'Facilitator') return;

     endSessionError.classList.add('hidden');
     resetEndSessionButton();
     endSessionModal.classList.remove('hidden');
 }

 function closeEndSessionModal() {
     endSessionModal.classList.add('hidden');
     endSessionError.classList.add('hidden');
     resetEndSessionButton();
 }

 function handleConfirmEndSession() {
     if (currentUser?.role !== 'Facilitator') return;

     endSessionError.classList.add('hidden');
     confirmEndSessionButton.disabled = true;
     confirmEndSessionButton.textContent = 'Ending...';
     sendMessage('endSession', {});
 }

 // On save, send changeRole for self
 function handleSaveRole() {
 const newRole = editRoleSelect.value;
 if (!newRole) {
     editRoleError.textContent = 'Please select a role.';
     return editRoleError.classList.remove('hidden');
 }
 if (newRole !== currentUser.role) {
     sendMessage('changeRole', { targetUserId: currentUser.id, newRole });
 }
 closeEditRoleModal();
 }

 // --- View Management ---
 function showLogin({ clearError = true } = {}) {
     closeInviteMenu();
     loginSection.classList.remove('hidden');
     pokerRoomSection.classList.add('hidden');
     if (clearError) {
         hideLoginError();
     }
     window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

     if (ws && ws.readyState === WebSocket.OPEN) {
         loginButton.disabled = false;
         loginButton.textContent = 'Enter Room';
     } else {
         loginButton.disabled = true;
         loginButton.textContent = 'Enter Room (Disconnected)';
     }
 }


 function showPokerRoom() {
     loginSection.classList.add('hidden');
     pokerRoomSection.classList.remove('hidden');
     window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
     // UI update will be triggered by receiving state from server
 }

 // --- UI Updates (Reflects state from server) ---
 function updateUI() {
    if (!currentUser) {
        // If no current user data, likely means we should be on login screen
        // This might happen if server removes user or connection drops unexpectedly
        logout(); // Use logout to ensure clean state
        return;
    }

     // ─── 8.3.1) Show current room at the top of the poker room UI
  roomDisplay.textContent = currentRoom ? `Room: ${currentRoom}` : '';
  roomOrg.textContent = currentCompany?.name || '';

    // Update greeting
    userGreeting.textContent = `Hello, ${currentUser.name} (${currentUser.role})`;

    renderRoundStatus();

    // Generate/Update Voting Cards
    renderVotingCards();

    // Render Participants List
    renderParticipantsList();

    // Show/Hide Facilitator Controls & Enable/Disable buttons
    if (currentUser.role === 'Facilitator') {
        facilitatorControls.classList.remove('hidden');
        inviteMenuButton.classList.remove('hidden');
        showVotesButton.disabled = votesRevealed; // Disable if already revealed
        startNextRoundButton.classList.toggle('hidden', !votesRevealed);
        startNextRoundButton.disabled = !votesRevealed;
        resetVotesButton.disabled = false;
        endSessionButton.classList.remove('hidden');
    } else {
        facilitatorControls.classList.add('hidden');
        inviteMenuButton.classList.add('hidden');
        closeInviteMenu();
        startNextRoundButton.classList.add('hidden');
        endSessionButton.classList.add('hidden');
    }

    // Show/Hide Observer Message & Disable Voting Cards
    if (currentUser.role === 'Observer') {
        observerMessage.classList.remove('hidden');
        votingCardsContainer.classList.add('is-disabled'); // Disable clicks
    } else {
        observerMessage.classList.add('hidden');
        votingCardsContainer.classList.remove('is-disabled');
    }

    // Show/Hide Vote Summary & Calculate Average
    if (votesRevealed) {
        voteSummary.classList.remove('hidden');
        calculateAndDisplayAverage();

        // Build an array of { name, vote }, sorted descending
        const voteEntries = participants
            .filter(p => (p.role === 'Voter' || p.role === 'Facilitator') && p.vote !== null && !isNaN(parseInt(p.vote)))
            .map(p => ({ name: p.name, vote: parseInt(p.vote) }))
            .sort((a, b) => b.vote - a.vote);

        const orderedContainer = document.getElementById('ordered-votes');
        const orderedList = document.getElementById('ordered-votes-list');
        orderedList.innerHTML = '';

        // Group by vote value: { 8: ['John','David'], 5: ['Mike','Steve'], ... }
        const groups = {};
        voteEntries.forEach(({ name, vote }) => {
            if (!groups[vote]) groups[vote] = [];
            groups[vote].push(name);
        });

        // Sort vote values descending.
        const sortedVotes = Object.keys(groups)
            .map(v => parseInt(v))
            .sort((a, b) => b - a);

        // Render each group as "Name1, Name2, …    —— voteValue"
        sortedVotes.forEach(voteValue => {
            const names = groups[voteValue].join(', ');
            const line = document.createElement('div');
            line.className = 'result-row';

            const namesSpan = document.createElement('span');
            namesSpan.className = 'result-names';
            namesSpan.textContent = names;

            const voteSpan = document.createElement('span');
            voteSpan.className = 'result-value';
            voteSpan.textContent = voteValue;

            line.appendChild(namesSpan);
            line.appendChild(voteSpan);
            orderedList.appendChild(line);
        });

        // Show container only if at least one group exists
        if (sortedVotes.length > 0) {
            orderedContainer.classList.remove('hidden');
        }
    } else {
        voteSummary.classList.add('hidden');

        // Hide ordered results when votes are reset or hidden
        document.getElementById('ordered-votes').classList.add('hidden');
    }
}

function renderRoundStatus() {
    roundStatus.textContent = votesRevealed ? 'Revealed' : 'Open';
    roundStatus.classList.toggle('is-locked', votesRevealed);
}

const { copyText } = window.ScrumPokerClipboard;


function renderVotingCards() {
    cardAnimator.clear();

    votingCardsContainer.innerHTML = '';
    votingCardsContainer.appendChild(observerMessage);

    fibonacciVotes.forEach(value => {
        const canVote = currentUser && currentUser.role !== 'Observer';
        const cardButton = cardDeck.createVotingCard({
            document,
            value,
            selected: currentUser?.vote === value,
            disabled: currentUser?.role === 'Observer' || votesRevealed,
            onClick: canVote ? handleVote : null
        });

        votingCardsContainer.appendChild(cardButton);
    });

    // Only animate if votes are not revealed
    if (!votesRevealed && animateVotingCards) {
        cardAnimator.animateCardsIntoView();
        animateVotingCards = false;
    }
}

 function renderParticipantsList() {
     participantsListContainer.innerHTML = ''; // Clear list

     // Sort participants: current user first, then alphabetically by name
     const sortedParticipants = [...participants].sort((a, b) => {
         if (a.id === currentUser?.id) return -1; // Use optional chaining
         if (b.id === currentUser?.id) return 1;
         return a.name.localeCompare(b.name);
     });


     sortedParticipants.forEach(participant => {
         const div = document.createElement('div');
         div.classList.add('participant-row');

         // --- Left side: Name and Role ---
         const nameRoleDiv = document.createElement('div');
         nameRoleDiv.classList.add('participant-info'); // Allow wrapping and spacing

         const nameSpan = document.createElement('span');
         nameSpan.textContent = participant.name;
         nameSpan.classList.add('participant-name');
         if (participant.id === currentUser?.id) {
             nameSpan.textContent += ' (You)';
             nameSpan.classList.add('is-current-user');
         }
         nameRoleDiv.appendChild(nameSpan);

         const roleSpan = document.createElement('span');
         roleSpan.textContent = `(${participant.role})`; // Display role clearly
         roleSpan.classList.add('participant-role');
          if (facilitatorIds.includes(participant.id)) {
              roleSpan.textContent += ' Lead'; // Indicate Facilitator
              roleSpan.classList.add('is-facilitator');
          }
         nameRoleDiv.appendChild(roleSpan);

          // --- Role change controls (for Facilitator view) ---
          if (currentUser?.role === 'Facilitator' && participant.id !== currentUser.id) {
              const controlsDiv = document.createElement('div');
              controlsDiv.classList.add('participant-role-controls'); // Spacing and wrapping for controls

              // Select dropdown for roles
              const roleSelect = document.createElement('select');
              roleSelect.classList.add('participant-role-select');
              // A full facilitator list only offers the role to those already holding it.
              const canGrant = facilitatorIds.length < MAX_FACILITATORS || facilitatorIds.includes(participant.id);
              const roles = canGrant ? ['Voter', 'Observer', 'Facilitator'] : ['Voter', 'Observer'];
              roles.forEach(r => {
                  const option = document.createElement('option');
                  option.value = r;
                  option.textContent = r;
                  if (r === participant.role) {
                      option.selected = true;
                  }
                  roleSelect.appendChild(option);
              });
              roleSelect.addEventListener('change', (e) => {
                  handleChangeRole(participant.id, e.target.value);
              });
              controlsDiv.appendChild(roleSelect);

              nameRoleDiv.appendChild(controlsDiv); // Add controls below/beside name/role
          }


         div.appendChild(nameRoleDiv);

         // --- Right side: Vote display / Card placeholder ---
         const voteContainer = document.createElement('div');
         voteContainer.classList.add('card-container', 'participant-vote'); // Prevent shrinking
         voteContainer.dataset.userId = participant.id; // Link container to user

         const card = document.createElement('div');
         card.classList.add('flip-card');
         // Determine flip state based on global votesRevealed and if participant voted
         if (votesRevealed && participant.vote !== null) {
             card.classList.add('flipped');
         }

         const cardFaceFront = document.createElement('div');
         cardFaceFront.classList.add('card-face', 'card-front');
         cardFaceFront.textContent = '♢'; // Symbol for card back

         const cardFaceBack = document.createElement('div');
         cardFaceBack.classList.add('card-face', 'card-back');
         // Show vote value only if revealed, otherwise show placeholder
         cardFaceBack.textContent = (votesRevealed && participant.vote !== null) ? participant.vote : '--';
         if (votesRevealed && participant.vote !== null) {
             cardFaceBack.classList.add('vote-sticker', 'revealed-sticker');
         }

         card.appendChild(cardFaceFront);
         card.appendChild(cardFaceBack);
         voteContainer.appendChild(card);

         // Show checkmark if voted (and votes not revealed yet)
         // Position checkmark relative to card-container
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

 // --- Event Handlers (Send messages to server) ---
 function createRoomInviteUrl() {
  if (!currentShareToken) return '';
  return `${window.location.origin}/join?token=${currentShareToken}`;
 }

 async function handleCopyRoomInvite(event) {
  if (currentUser?.role !== 'Facilitator') return;

  const button = event.currentTarget;
  const inviteUrl = createRoomInviteUrl();
  if (!inviteUrl) {
    showVoteError('Invite link unavailable. Rejoin the room and try again.');
    return;
  }

  const originalText = button.textContent.trim();
  button.disabled = true;

  try {
    await copyText(inviteUrl);
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

 function handleLogin() {
  const name = nameInput.value.trim();
  const role = roleSelect.value;
  const room = roomInput.value.trim();
  if (name && role && room) {
    hideLoginError();
    loginButton.disabled = true;
    currentRoom = room;
    pendingLoginContext = { name, role, room };
    pendingLoginSource = 'manual';
    sendMessage('login', { name, role, room });
  } else {
    showLoginError('Please enter your room name and name.');
  }
}

 function handleVote(event) {

    if (votesRevealed || !currentUser || currentUser.role === 'Observer') return;
        const selectedValue = event.currentTarget.dataset.value; // Use currentTarget!
        sendMessage('vote', { vote: selectedValue });
        document.querySelectorAll('.vote-card').forEach(btn => btn.classList.remove('selected', 'picked'));
        const picked = event.currentTarget;
        picked.classList.add('selected', 'picked', 'placed');
        picked.addEventListener('animationend', () => picked.classList.remove('placed'), { once: true });
    }

 function handleShowVotes() {
      if (currentUser?.role === 'Facilitator' && !votesRevealed) {
         sendMessage('revealVotes', {});
     }
 }

 function handleStartNextRound() {
     if (currentUser?.role === 'Facilitator' && votesRevealed) {
         startNextRoundButton.disabled = true;
         sendMessage('startNextRound', {});
     }
 }

 function resetAllCards() {

     document.querySelectorAll('.flip-card').forEach(card => card.classList.remove('flipped'));
 }

 function handleResetVotes() {
     animateVotingCards = true;
      if (currentUser?.role === 'Facilitator') {
         resetVotesButton.disabled = true;
         resetFaceDownBeforeStateUpdate = true;
         cardAnimator.animateCardsFaceDownBeforeReset(() => {
             sendMessage('resetVotes', {});
             resetAllCards();
         });
     }
 }

  function handleChangeRole(targetUserId, newRole) {
      if (currentUser?.role === 'Facilitator') {
          sendMessage('changeRole', { targetUserId: targetUserId, newRole: newRole });
      }
  }

  function resetRoomState() {
     currentUser = null;
     participants = [];
     votesRevealed = false;
     facilitatorIds = [];
     currentRoom = null;
     currentShareToken = null;
     pendingLoginContext = null;
     pendingLoginSource = '';

     // Clear session
     sessionStorage.removeItem('scrumPokerUserId');
     sessionStorage.removeItem('scrumPokerUserName');
     clearRoomSession();
  }

  function handleSessionEnded(message) {
     resetRoomState();
     closeEditRoleModal();
     closeEndSessionModal();
     showLogin({ clearError: false });
     showLoginError(message);
     updateConnectionStatus('connected', 'Connected');
  }

  function logout() {
     // Clear state and session
     resetRoomState();

     // Send logout to server
     if (ws && ws.readyState === WebSocket.OPEN) {
         sendMessage('logout', {});
     }

     // Navigate to hub logout
     window.location.assign('/auth/logout');
 }

 // --- Calculations (Uses local state derived from server) ---
 function calculateAndDisplayAverage() {
     let sum = 0;
     let numericVoteCount = 0;

     participants.forEach(p => {
         // Only include numeric votes from Voters or Facilitators
         if ((p.role === 'Voter' || p.role === 'Facilitator') && p.vote !== null && !isNaN(parseInt(p.vote))) {
             sum += parseInt(p.vote);
             numericVoteCount++;
         }
     });

     const average = numericVoteCount > 0 ? (sum / numericVoteCount).toFixed(1) : '--';
     averageVoteSpan.textContent = average;
 }

 // --- Start the application ---
 init();



 
