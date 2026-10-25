(function attachVoteResults(window) {
    function countsInResults(p) {
        return (p.role === 'Voter' || p.role === 'Facilitator') && p.vote !== null && !isNaN(parseInt(p.vote, 10));
    }

    function averageOf(participants) {
        const votes = participants.filter(countsInResults).map((p) => parseInt(p.vote, 10));
        if (votes.length === 0) return '--';
        return (votes.reduce((sum, v) => sum + v, 0) / votes.length).toFixed(1);
    }

    // Names grouped by vote value, highest value first.
    function groupVotes(participants) {
        const groups = new Map();
        participants.filter(countsInResults).forEach((p) => {
            const value = parseInt(p.vote, 10);
            if (!groups.has(value)) groups.set(value, []);
            groups.get(value).push(p.name);
        });
        return [...groups.entries()].sort((a, b) => b[0] - a[0]);
    }

    function resultRow(document, names, value) {
        const line = document.createElement('div');
        line.className = 'result-row';
        const namesSpan = document.createElement('span');
        namesSpan.className = 'result-names';
        namesSpan.textContent = names.join(', ');
        const valueSpan = document.createElement('span');
        valueSpan.className = 'result-value';
        valueSpan.textContent = value;
        line.append(namesSpan, valueSpan);
        return line;
    }

    function renderResults({ document, participants, votesRevealed }) {
        const summary = document.getElementById('vote-summary');
        const ordered = document.getElementById('ordered-votes');
        summary.classList.toggle('hidden', !votesRevealed);
        if (!votesRevealed) {
            ordered.classList.add('hidden');
            return;
        }
        document.getElementById('average-vote').textContent = averageOf(participants);
        const list = document.getElementById('ordered-votes-list');
        list.innerHTML = '';
        const groups = groupVotes(participants);
        groups.forEach(([value, names]) => list.appendChild(resultRow(document, names, value)));
        if (groups.length > 0) ordered.classList.remove('hidden');
    }

    window.ScrumPokerVoteResults = { renderResults };
})(window);
