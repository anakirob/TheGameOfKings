// ==========================================
// SECTION 1: SYSTEM & STATE VARIABLES
// ==========================================
const socket = io();
let myColor = null; let gameOver = false; let myName = "";
let playerNames = { white: "White Player", black: "Black Player" };
const honorifics = ["Lord", "Emperor", "King", "President", "Chief", "General", "Pharaoh", "Sultan", "Warlord", "Baron", "Duke", "Overseer"];
const ancientRulers = ["Gilgamesh", "Cleopatra", "Alexander", "Boudicca", "Leonidas", "Hatshepsut", "Hammurabi", "Genghis", "Ramses", "Ashoka"];

// ==========================================
// SECTION 2: UI, MODALS, AND THEMES
// ==========================================
let procCb1 = null; let procCb2 = null;

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(id === 'game-screen') applyDynamicZoom();
}

function showProclamation(message, cb1 = null, text1 = "Acknowledge", cb2 = null, text2 = null) {
    document.getElementById('proclamation-text').innerHTML = `<strong>${message}</strong>`;
    const btn1 = document.getElementById('btn-proc-1'); btn1.innerText = text1; procCb1 = cb1 || (() => {});
    const btn2 = document.getElementById('btn-proc-2');
    if (text2) { btn2.innerText = text2; btn2.style.display = 'inline-block'; procCb2 = cb2 || (() => {}); }
    else { btn2.style.display = 'none'; procCb2 = null; }
    document.getElementById('proclamation-overlay').style.display = 'flex';
}

function handleProclamation(btnIndex) {
    document.getElementById('proclamation-overlay').style.display = 'none';
    if (btnIndex === 1 && procCb1) procCb1(); if (btnIndex === 2 && procCb2) procCb2();
}

function toggleThemePanel(panelColor) {
    if (panelColor !== myColor) {
        const icons = document.getElementById(`${panelColor}-summons`);
        const themeSliders = document.getElementById(`${panelColor}-theme`);
        if (icons.style.display === 'none') {
            icons.style.display = 'flex'; themeSliders.style.display = 'none';
        } else {
            icons.style.display = 'none'; themeSliders.style.display = 'flex';
        }
    }
}

function updateTheme(h, s, emit = true) {
    document.documentElement.style.setProperty('--theme-h', h);
    document.documentElement.style.setProperty('--theme-s', s + '%');
    document.querySelectorAll('.hue-slider').forEach(el => el.value = h);
    document.querySelectorAll('.sat-slider').forEach(el => el.value = s);
    if (emit && myColor) socket.emit('syncTheme', { h: h, s: s });
}

socket.on('receiveTheme', (data) => { updateTheme(data.h, data.s, false); });

function selectSummonType(type) {
    if (!summonState.active || summonState.step !== 2) return;
    const idx = summonState.options.indexOf(type);
    if (idx !== -1) {
        summonState.currentIndex = idx;
        renderBoard();
        updateInventoryUI();
    }
}

// ==========================================
// SECTION 3: LOBBY & CHAT LOGIC
// ==========================================
function login() {
    let randomTitle = honorifics[Math.floor(Math.random() * honorifics.length)];
    let inputName = document.getElementById('name-input').value.trim();
    if (!inputName) inputName = ancientRulers[Math.floor(Math.random() * ancientRulers.length)];
    myName = randomTitle + " " + inputName;
    document.getElementById('user-display').innerHTML = `<strong>${myName}</strong>`;
    showScreen('lobby-screen');
}

function sendChatText() {
    const input = document.getElementById('chat-input'); const text = input.value.trim();
    if (text) { socket.emit('lobbyChat', { sender: myName, type: 'text', content: text }); input.value = ''; }
}

function sendChatImage(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); let width = img.width, height = img.height; const maxSize = 320;
            if (width > maxSize || height > maxSize) {
                if (width > height) { height = Math.round((height * maxSize) / width); width = maxSize; }
                else { width = Math.round((width * maxSize) / height); height = maxSize; }
            }
            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
            const base64Img = canvas.toDataURL(file.type);
            socket.emit('lobbyChat', { sender: myName, type: 'image', content: base64Img });
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file); event.target.value = '';
}

socket.on('lobbyChat', (data) => {
    const chatBox = document.getElementById('chat-messages'); const msgDiv = document.createElement('div'); msgDiv.className = 'chat-msg';
    const senderSpan = document.createElement('strong'); senderSpan.innerText = `[${data.sender}]: `;
    if (data.socketId !== socket.id) {
        senderSpan.className = 'chat-name clickable'; senderSpan.title = "Challenge to a Duel";
        senderSpan.onclick = () => issueChallenge(data.socketId, data.sender);
    } else { senderSpan.className = 'chat-name self'; }
    msgDiv.appendChild(senderSpan);
    if (data.type === 'text') { const textSpan = document.createElement('span'); textSpan.innerText = data.content; msgDiv.appendChild(textSpan); }
    else if (data.type === 'image') {
        msgDiv.appendChild(document.createElement('br')); const imgEl = document.createElement('img');
        imgEl.src = data.content; imgEl.style.borderRadius = '5px'; imgEl.style.border = '2px solid var(--border)'; imgEl.style.marginTop = '5px';
        msgDiv.appendChild(imgEl);
    }
    chatBox.appendChild(msgDiv); chatBox.scrollTop = chatBox.scrollHeight;
    while (chatBox.childNodes.length > 20) chatBox.removeChild(chatBox.firstChild);
});

// ==========================================
// SECTION 4: MULTIPLAYER MATCHMAKING
// ==========================================
function issueChallenge(targetId, targetName) {
    showProclamation(`Do you wish to challenge ${targetName} to a duel?`,
                     () => { socket.emit('challengePlayer', { targetId: targetId, challengerName: myName }); showProclamation(`Challenge sent. Awaiting response...`); }, "Challenge!",
                     () => {}, "Cancel"
    );
}
socket.on('incomingChallenge', (data) => {
    showProclamation(`${data.challengerName} has challenged you to a duel!`,
                     () => { socket.emit('acceptChallenge', data.challengerId); }, "Accept",
                     () => { socket.emit('declineChallenge', data.challengerId); }, "Decline"
    );
});
socket.on('challengeDeclined', () => { showProclamation("Your challenge was refused."); });
function findOnlineMatch() {
    document.getElementById('find-match-btn').innerText = 'Waiting...';
    document.getElementById('find-match-btn').disabled = true; socket.emit('findMatch');
}
socket.on('assignColor', (color) => {
    myColor = color; gameOver = false; playerNames[myColor] = myName;
    if (color === 'white') document.body.classList.add('light-mode');
    else document.body.classList.remove('light-mode');
    document.getElementById('find-match-btn').innerText = 'Enter Queue';
    document.getElementById('find-match-btn').disabled = false;
    socket.emit('sendGameState', { type: 'nameSync', color: myColor, name: myName }); startGame('online');
});
socket.on('receiveGameState', (newState) => {
    if (newState.type === 'nameSync') { playerNames[newState.color] = newState.name; renderBoard(); return; }
    boardData = newState.board; inventory = newState.inventory; currentTurn = newState.turn; lordPositions = newState.lords;
    updateInventoryUI(); applyDynamicZoom(); renderBoard();
    if (newState.winner) { gameOver = true; setTimeout(() => { showProclamation(newState.killMsg, () => location.reload()); }, 800); }
});
socket.on('opponentDisconnected', () => { if (!gameOver) { showProclamation('Your cowardly opponent fled the battlefield!', () => location.reload()); } });

// ==========================================
// SECTION 5: GAME ENGINE & LOGIC
// ==========================================
const PIECES = {
    lord:    { icon: '♚', max: 1, textIcon: '♔', ability: 'None' }, lady:   { icon: '♛', max: 1, textIcon: '♕', ability: 'Explode' },
    castle:  { icon: '♜', max: 2, textIcon: '♖', ability: 'Teleport' }, cleric:  { icon: '♝', max: 2, textIcon: '♗', ability: 'Missile' },
    knight:  { icon: '♞', max: 2, textIcon: '♘', ability: 'Berserk' }, peasant: { icon: '♟', max: Infinity, textIcon: '♙', ability: 'Charge' }
};

let boardData = []; let currentTurn = 'white'; let selectedCell = null; let lordPositions = { white: {r:7, c:7}, black: {r:0, c:0} };
let summonState = { active: false, step: 0, targetR: null, targetC: null, options: [], currentIndex: 0 };
let abilityState = { active: false, r: null, c: null, piece: null, abilityName: null };
let inventory = { white: { lady: 1, castle: 2, cleric: 2, knight: 2, peasant: Infinity, peasantsOnBoard: 0 }, black: { lady: 1, castle: 2, cleric: 2, knight: 2, peasant: Infinity, peasantsOnBoard: 0 } };

function startGame(mode) {
    if(mode === 'dumb') {
        playerNames.white = myName; playerNames.black = honorifics[Math.floor(Math.random() * honorifics.length)] + " AI (Local)";
        myColor = 'white'; document.body.classList.add('light-mode');
    }
    initBoard(); updateInventoryUI(); showScreen('game-screen'); renderBoard();
}

function initBoard() {
    boardData = Array(8).fill(null).map(() => Array(8).fill(null));
    boardData[0][0] = { type: 'lord', color: 'black', hasUsedAbility: false }; boardData[7][7] = { type: 'lord', color: 'white', hasUsedAbility: false };
}

function renderBoard() {
    const boardDiv = document.getElementById('board'); boardDiv.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div'); cell.className = `cell ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            const piece = boardData[r][c];
            if (selectedCell) {
                if (selectedCell.r === r && selectedCell.c === c) cell.classList.add('selected');
                else if (isValidMove(selectedCell, r, c)) { if (piece) cell.classList.add('valid-capture'); else cell.classList.add('valid-move'); }
            }
            if (abilityState.active && abilityState.r === r && abilityState.c === c) cell.classList.add('targeting');
            if (summonState.active && summonState.step === 1 && !piece && isAdjacentToLord(r, c, currentTurn)) cell.classList.add('highlight-summon-target');
            if (summonState.active && summonState.step === 2 && r === summonState.targetR && c === summonState.targetC) {
                let previewType = summonState.options[summonState.currentIndex];
                cell.innerText = currentTurn === 'white' ? PIECES[previewType].textIcon : PIECES[previewType].icon;
                cell.style.color = currentTurn === 'white' ? 'var(--piece-white)' : 'var(--piece-black)';
                cell.classList.add('summon-preview');
            } else if (piece) {
                cell.innerText = piece.color === 'white' ? PIECES[piece.type].textIcon : PIECES[piece.type].icon;
                cell.style.color = piece.color === 'white' ? 'var(--piece-white)' : 'var(--piece-black)';
                if (piece.hasUsedAbility) cell.classList.add('piece-used-ability');
            }
            cell.onclick = () => handleCellClick(r, c); cell.ondblclick = (e) => { e.preventDefault(); attemptAbilityTrigger(r, c); }; cell.onmousedown = (e) => { if (e.button === 1) { e.preventDefault(); attemptAbilityTrigger(r, c); } };
            boardDiv.appendChild(cell);
        }
    }
    document.getElementById('turn-indicator').innerText = `It is ${playerNames[currentTurn]}'s turn`;
}

function handleCellClick(r, c) {
    if (myColor && currentTurn !== myColor) return;
    if (gameOver) return;
    const clickedPiece = boardData[r][c];
    if (abilityState.active) {
        if (abilityState.abilityName === 'Missile') {
            if (clickedPiece && clickedPiece.color !== currentTurn && clickedPiece.type !== 'lord') {
                boardData[r][c] = null; abilityState.piece.hasUsedAbility = true; endTurn();
            } else showProclamation("Missile must target an enemy piece excluding their Lord.");
        }
        else if (abilityState.abilityName === 'Charge') {
            const dr = Math.abs(abilityState.r - r); const dc = Math.abs(abilityState.c - c);
            if ((dr === 2 && dc === 0) || (dr === 0 && dc === 2)) {
                if (boardData[r][c] !== null) { showProclamation("The landing square must be empty to Charge."); return; }
                let midR = abilityState.r + (r - abilityState.r) / 2; let midC = abilityState.c + (c - abilityState.c) / 2; let jumpedPiece = boardData[midR][midC];
                let whiteLordDead = false; let blackLordDead = false;
                if (jumpedPiece) {
                    if (jumpedPiece.type === 'lord') { if (jumpedPiece.color === 'white') whiteLordDead = true; if (jumpedPiece.color === 'black') blackLordDead = true; }
                    boardData[midR][midC] = null;
                }
                boardData[r][c] = abilityState.piece; boardData[abilityState.r][abilityState.c] = null; abilityState.piece.hasUsedAbility = true;
                if (whiteLordDead || blackLordDead) { let winningColor = whiteLordDead ? 'black' : 'white'; triggerWin(winningColor, 'peasant', currentTurn); return; }
                checkPeasantAscension(r, c, abilityState.piece); endTurn();
            } else showProclamation("Charge must leap exactly 2 squares cardinally.");
        }
        return;
    }
    if (summonState.active) {
        if (summonState.step === 2 && r === summonState.targetR && c === summonState.targetC) executeSummon(r, c, summonState.options[summonState.currentIndex]);
        else if (summonState.step === 1 && !clickedPiece && isAdjacentToLord(r, c, currentTurn)) { summonState.step = 2; summonState.targetR = r; summonState.targetC = c; renderBoard(); updateInventoryUI(); }
        return;
    }
    if (clickedPiece && clickedPiece.color === currentTurn) { selectedCell = {r, c, piece: clickedPiece}; renderBoard(); return; }
    if (selectedCell) {
        if (isValidMove(selectedCell, r, c)) {
            let isWin = boardData[r][c] && boardData[r][c].type === 'lord';
            boardData[r][c] = selectedCell.piece; boardData[selectedCell.r][selectedCell.c] = null;
            if(selectedCell.piece.type === 'lord') lordPositions[currentTurn] = {r, c};
            if (isWin) { triggerWin(currentTurn, selectedCell.piece.type, currentTurn); return; }
            checkPeasantAscension(r, c, selectedCell.piece); endTurn();
        } else selectedCell = null;
        renderBoard();
    }
}

function isValidMove(startPos, endR, endC) {
    const p = startPos.piece; if (boardData[endR][endC] && boardData[endR][endC].color === p.color) return false;
    const dr = Math.abs(startPos.r - endR); const dc = Math.abs(startPos.c - endC);
    if (p.type === 'lord') return dr <= 1 && dc <= 1;
    if (p.type === 'peasant') {
        const isCapture = boardData[endR][endC] !== null;
        if (!isCapture && (dr + dc === 1)) return true;
        if (isCapture && (dr === 1 && dc === 1)) return true;
        return false;
    }
    if (p.type === 'knight') return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
    const isPathClear = (r1, c1, r2, c2) => {
        let dr = Math.sign(r2 - r1); let dc = Math.sign(c2 - c1); let currR = r1 + dr; let currC = c1 + dc;
        while (currR !== r2 || currC !== c2) { if (boardData[currR][currC] !== null) return false; currR += dr; currC += dc; }
        return true;
    };
    if (p.type === 'castle') { if (dr !== 0 && dc !== 0) return false; return isPathClear(startPos.r, startPos.c, endR, endC); }
    if (p.type === 'cleric') { if (dr !== dc) return false; return isPathClear(startPos.r, startPos.c, endR, endC); }
    if (p.type === 'lady') { if (dr !== 0 && dc !== 0 && dr !== dc) return false; return isPathClear(startPos.r, startPos.c, endR, endC); }
    return false;
}

function isAdjacentToLord(r, c, color) { const lord = lordPositions[color]; return Math.abs(lord.r - r) <= 1 && Math.abs(lord.c - c) <= 1; }

function checkPeasantAscension(r, c, piece) {
    if (piece.type !== 'peasant') return;
    let hasAscended = (currentTurn === 'white' && (r === 0 || c === 0)) || (currentTurn === 'black' && (r === 7 || c === 7));
    if (hasAscended) {
        boardData[r][c] = null; inventory[currentTurn].peasantsOnBoard--; let inv = inventory[currentTurn]; let restored = null;
        if (inv.lady < 1) { inv.lady++; restored = 'Lady'; } else if (inv.castle < 2) { inv.castle++; restored = 'Castle'; } else if (inv.knight < 2) { inv.knight++; restored = 'Horsey'; } else if (inv.cleric < 2) { inv.cleric++; restored = 'Cleric'; }
        if (restored) showProclamation(`ASCENSION! Your Peasant reached the edge and restored your ${restored}!`);
        else showProclamation(`ASCENSION! Your Peasant reached the edge, but your inventory is already full!`);
    }
}

function attemptAbilityTrigger(r, c) {
    if (myColor && currentTurn !== myColor) return;
    if (gameOver) return;
    const piece = boardData[r][c]; if (!piece || piece.color !== currentTurn) return;
    if (piece.type === 'lord') {
        let inv = inventory[currentTurn]; let available = [];
        for (let key in inv) {
            if (key === 'peasantsOnBoard') continue;
            if (key === 'peasant' && inv.peasantsOnBoard < 8) available.push(key);
            else if (key !== 'peasant' && inv[key] > 0) available.push(key);
        }
        if (available.length === 0) { showProclamation("You have no pieces left to summon."); return; }
        summonState.active = true; summonState.step = 1; summonState.options = available; summonState.currentIndex = 0; renderBoard(); updateInventoryUI(); return;
    }
    if (piece.hasUsedAbility) { showProclamation(`This ${piece.type} has already used its ability.`); return; }
    activateAbility(r, c, piece);
}

function activateAbility(r, c, piece) {
    if (piece.type === 'knight') {
        piece.hasUsedAbility = true; let whiteLordDead = false; let blackLordDead = false;
        for(let i=-1; i<=1; i++) {
            for(let j=-1; j<=1; j++) {
                let nr = r+i, nc = c+j;
                if(nr>=0 && nr<8 && nc>=0 && nc<8 && (i!==0 || j!==0)) {
                    let target = boardData[nr][nc];
                    if (target && target.type === 'lord') { if (target.color === 'white') whiteLordDead = true; if (target.color === 'black') blackLordDead = true; }
                    boardData[nr][nc] = null;
                }
            }
        }
        if (whiteLordDead || blackLordDead) {
            let winningColor; if (whiteLordDead && blackLordDead) winningColor = currentTurn === 'white' ? 'black' : 'white'; else if (whiteLordDead) winningColor = 'black'; else winningColor = 'white';
            triggerWin(winningColor, 'knight', currentTurn); return;
        }
        endTurn();
    }
    else if (piece.type === 'lady') {
        piece.hasUsedAbility = true;
        for(let i=0; i<8; i++) { for(let j=0; j<8; j++) { let p = boardData[i][j]; if(p && p.color !== currentTurn && p.type !== 'lord') boardData[i][j] = null; } }
        endTurn();
    }
    else if (piece.type === 'castle') {
        piece.hasUsedAbility = true; let lPos = lordPositions[currentTurn]; let lordPiece = boardData[lPos.r][lPos.c]; boardData[lPos.r][lPos.c] = piece; boardData[r][c] = lordPiece; lordPositions[currentTurn] = {r, c}; endTurn();
    }
    else if (piece.type === 'cleric' || piece.type === 'peasant') {
        abilityState = { active: true, r: r, c: c, piece: piece, abilityName: PIECES[piece.type].ability }; renderBoard();
    }
}

function executeSummon(r, c, type) {
    const newPiece = { type: type, color: currentTurn, hasUsedAbility: false };
    boardData[r][c] = newPiece;
    if (type !== 'peasant') inventory[currentTurn][type]--;
    else {
        inventory[currentTurn].peasantsOnBoard++;
        let isGoalLine = (currentTurn === 'white' && (r === 0 || c === 0)) || (currentTurn === 'black' && (r === 7 || c === 7));
        if (isGoalLine) checkPeasantAscension(r, c, newPiece);
    }
    endTurn();
}

function triggerWin(winnerColor, killerType, killerColor) {
    gameOver = true; renderBoard(); let loserColor = winnerColor === 'white' ? 'black' : 'white';
    let epitaph = generateWinMessage(playerNames[winnerColor], playerNames[loserColor], killerType, killerColor, loserColor);
    if (myColor) socket.emit('sendGameState', { board: boardData, inventory: inventory, turn: currentTurn, lords: lordPositions, winner: winnerColor, killMsg: epitaph });
    setTimeout(() => { showProclamation(epitaph, () => location.reload()); }, 800);
}

function generateWinMessage(winnerName, loserName, killerType, killerColor, loserColor) {
    if (killerType === 'peasant' && killerColor === loserColor) return "Viva la revolucion!";
    const vicTerms = ["reigns supreme", "conquers all", "triumphs gloriously", "claims ultimate victory"];
    const loseTerms = ["was deposed", "is pushing up daisies", "meets a grim fate", "has been dethroned"];
    const platitudes = ["They will be sorely missed.", "May they live on in infamy.", "A tragic end to a mediocre reign.", "History will quickly forget them.", "At least they tried."];
    const conditions = { 'knight': "trampled by a horsey", 'castle': "crushed by a castle", 'lady': "bitch-slapped by the lady", 'cleric': "excommunicated by a cleric", 'peasant': "deposed by peasants", 'lord': "fell victim to regicide" };
    return `${winnerName} ${vicTerms[Math.floor(Math.random() * vicTerms.length)]}! ${loserName} ${loseTerms[Math.floor(Math.random() * loseTerms.length)]}. ${conditions[killerType] ? conditions[killerType].charAt(0).toUpperCase() + conditions[killerType].slice(1) : "Destroyed by unknown forces"}. ${platitudes[Math.floor(Math.random() * platitudes.length)]}`;
}

function endTurn() {
    currentTurn = currentTurn === 'white' ? 'black' : 'white'; selectedCell = null; summonState.active = false; summonState.step = 0; abilityState.active = false;
    updateInventoryUI(); applyDynamicZoom(); if (myColor) socket.emit('sendGameState', { board: boardData, inventory: inventory, turn: currentTurn, lords: lordPositions }); renderBoard();
}

function updateInventoryUI() {
    ['white', 'black'].forEach(color => {
        const row = document.getElementById(`${color}-summons`); row.innerHTML = '';
        for (const [pieceType, count] of Object.entries(inventory[color])) {
            if (pieceType === 'peasantsOnBoard') continue;
            const iconDiv = document.createElement('div'); iconDiv.className = 'summon-icon';
            if (summonState.active && summonState.step === 2 && currentTurn === color && summonState.options[summonState.currentIndex] === pieceType) iconDiv.classList.add('active-selection');
            iconDiv.innerText = color === 'white' ? PIECES[pieceType].textIcon : PIECES[pieceType].icon;
            iconDiv.style.color = color === 'white' ? 'var(--piece-white)' : 'var(--piece-black)';
            iconDiv.onclick = (e) => { if (color === myColor) { e.stopPropagation(); selectSummonType(pieceType); } };
            if (pieceType !== 'peasant') { const badge = document.createElement('div'); badge.className = 'summon-count'; badge.innerText = count; iconDiv.appendChild(badge); }
            if ((pieceType !== 'peasant' && count <= 0) || (pieceType === 'peasant' && inventory[color].peasantsOnBoard >= 8)) iconDiv.classList.add('disabled');
            row.appendChild(iconDiv);
        }
    });
}

function scaleUI(value) { document.documentElement.style.setProperty('--cell-size', value + 'px'); document.documentElement.style.setProperty('--piece-size', (value * 0.65) + 'px'); }

function applyDynamicZoom() {
    let maxCellSize = Math.floor(Math.min(window.innerHeight - 250, window.innerWidth - 100) / 8);
    maxCellSize = Math.max(30, Math.min(maxCellSize, 120));
    let isMyTurn = (myColor === currentTurn) || (!myColor && currentTurn === 'white');
    let targetZoom = isMyTurn ? maxCellSize : Math.floor(maxCellSize * 0.6);
    scaleUI(targetZoom);
}

window.addEventListener('resize', () => { if(document.getElementById('game-screen').classList.contains('active')) applyDynamicZoom(); });
window.addEventListener('contextmenu', (e) => { if(document.getElementById('game-screen').classList.contains('active')) { e.preventDefault(); selectedCell = null; summonState.active = false; summonState.step = 0; abilityState.active = false; renderBoard(); updateInventoryUI(); } });
window.addEventListener('wheel', (e) => {
    if (summonState.active && summonState.step === 2) { e.preventDefault(); if (e.deltaY > 0) summonState.currentIndex = (summonState.currentIndex + 1) % summonState.options.length; else summonState.currentIndex = (summonState.currentIndex - 1 + summonState.options.length) % summonState.options.length; renderBoard(); updateInventoryUI(); }
}, { passive: false });
