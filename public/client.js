const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
document.addEventListener('contextmenu', (event) => event.preventDefault());
let myId = null;
let nickname = '';
let isHost = false;
let gameState = null;
let scaleFactor;
let isChatting = false;
let chatDraft = '';
let cursorVisible = true;
let lastBlinkTime = Date.now();
let coinData = new Map();
let isAiming = false;
let aimStartTime = 0;
let cursorX = 0;
let cursorY = 0;

const VIRTUAL_WIDTH = 1600;
const VIRTUAL_HEIGHT = 800;
const PLAYER_RADIUS = 10;
const COIN_RADIUS = 14;
const SPIN_SPEED = 4 * Math.PI;
const ROTATION_SPEED = Math.PI;
const COIN_LIFETIME = 5;
const CHAT_LINE_HEIGHT = 12;
const MAX_CHAT_MESSAGES = 5;
const CHAT_LOG_X = VIRTUAL_WIDTH - 120;
const CHAT_LOG_MAX_LINES = 20;
const CHAT_LOG_TOP = VIRTUAL_HEIGHT * 0.1;
const CHAT_LOG_BOTTOM = VIRTUAL_HEIGHT * 0.9;
const CHAT_FONT_SIZE = 8;
const maxMessageWidth = 110;
const BAZOOKA_MAX_VELOCITY = 750;
const PROJECTILE_WIDTH = 20;
const PROJECTILE_HEIGHT = 10;
const MAX_PROJECTILES = 50;
const BLAST_RADIUS = 75;
const BLAST_DURATION = 0.25;
const MAX_BLAST_FORCE = 750;

// Mouse Event Listeners
document.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    cursorX = (event.clientX - rect.left) / scaleFactor;
    cursorY = (event.clientY - rect.top) / scaleFactor;
});

document.addEventListener('mousedown', (event) => {
    if (event.button === 2 && gameState && gameState.state === 'playing' && !isChatting) {
        isAiming = true;
        aimStartTime = Date.now();
    }
});

document.addEventListener('mouseup', (event) => {
    if (event.button === 2 && isAiming) {
        isAiming = false;
        const aimTime = Math.min((Date.now() - aimStartTime) / 1000, 0.75); // Cap at 0.75s
        const me = gameState.players.find(p => p.id === myId);
        if (me) {
            const dx = cursorX - me.x;
            const dy = cursorY - me.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const direction = { x: dx / dist, y: dy / dist };
            const power = aimTime / 0.75; // Normalize to 0-1
            socket.emit('input', {
                type: 'bazooka_fire',
                directionX: direction.x,
                directionY: direction.y,
                power
            });
        }
    }
});

// UI Functions
function showRoomBrowser() {
    document.getElementById('roomBrowser').style.display = 'block';
    document.getElementById('gameContainer').style.display = 'none';
}

function showGame() {
    document.getElementById('mainContainer').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'flex';
    document.getElementById('resetButton').style.display = isHost ? 'block' : 'none';
}

function createRoom() {
    const input = document.getElementById('nickname').value.trim();
    const gameMode = document.getElementById('gameModeSelect').value;
    let options = { gameMode };

    if (gameMode === 'deathmatch') {
        options.friendlyFire = document.getElementById('friendlyFireSelect').value === 'on';
        const killLimit = document.getElementById('killLimitSelect').value;
        options.killLimit = killLimit === 'Infinity' ? Infinity : parseInt(killLimit);
        const timeLimit = document.getElementById('timeLimitDeathmatchSelect').value;
        options.timeLimit = timeLimit === 'Infinity' ? Infinity : parseInt(timeLimit);
    } else { // goldrush
        const goldWinLimit = document.getElementById('goldWinLimitSelect').value;
        options.goldWinLimit = parseInt(goldWinLimit);
        const timeLimit = document.getElementById('timeLimitGoldrushSelect').value;
        options.timeLimit = timeLimit === 'Infinity' ? Infinity : parseInt(timeLimit);
    }

    if (input) {
        socket.emit('setNickname', input);
    }
    socket.emit('createRoom', options);
}

function joinRoomById(roomId) {
    const input = document.getElementById('nickname').value.trim();
    if (input) {
        socket.emit('setNickname', input);
    }
    socket.emit('joinRoom', { roomId });
}

function resetGame() {
    socket.emit('resetGame');
}

function resizeCanvas() {
    let width = window.innerWidth * 0.95;
    let height = window.innerHeight * 0.95;
    const aspectRatio = VIRTUAL_WIDTH / VIRTUAL_HEIGHT;
    if (width / height > aspectRatio) {
        width = height * aspectRatio;
    } else {
        height = width / aspectRatio;
    }
    canvas.width = width;
    canvas.height = height;
    scaleFactor = width / VIRTUAL_WIDTH;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Socket Event Listeners
socket.on('connect', () => {
    myId = socket.id;
});

socket.on('roomJoined', ({ roomId, isHost: hostStatus }) => {
    isHost = hostStatus;
    document.getElementById('currentRoomId').textContent = roomId;
    document.getElementById('isHost').textContent = isHost ? 'Yes' : 'No';
    showGame();
});

socket.on('roomList', (rooms) => {
    const roomList = document.getElementById('roomList');
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const tr = document.createElement('tr');
        const timeLimit = typeof room.timeLimit === 'number' && isFinite(room.timeLimit) ? room.timeLimit + 's' : '∞';
        const scoreLimit = typeof room.scoreLimit === 'number' && isFinite(room.scoreLimit) ? room.scoreLimit : '∞';
        tr.innerHTML = `
            <td>${room.name}</td>
            <td>${room.gameMode}</td>
            <td>${room.friendlyFire ? 'On' : 'Off'}</td>
            <td>${timeLimit}</td>
            <td>${scoreLimit}</td>
            <td>${room.playerCount}/${room.maxPlayers}</td>
        `;
        const joinTd = document.createElement('td');
        const joinBtn = document.createElement('button');
        joinBtn.textContent = 'Join';
        joinBtn.onclick = () => joinRoomById(room.id);
        joinTd.appendChild(joinBtn);
        tr.appendChild(joinTd);
        roomList.appendChild(tr);
    });
});

socket.on('gameState', (state) => {
    gameState = state;
    updateCoinData();
    render();
});

socket.on('error', (msg) => {
    alert(msg);
});

// Keyboard and Canvas Event Listeners
document.addEventListener('keydown', (e) => {
    if (!gameState || gameState.state !== 'playing') return;
    if (e.key === 't' && !isChatting && gameState.gameMode === 'teamDeathmatch') {
        socket.emit('input', { type: 'switchTeam' });
        e.preventDefault();
      }
    if (e.key === 'Enter' && !isChatting) {
        startChat();
        e.preventDefault();
        return;
    }

    if (isChatting) {
        if (e.key === 'Enter') {
            sendChat();
            e.preventDefault();
        } else if (e.key === 'Escape') {
            stopChat();
            e.preventDefault();
        } else if (e.key === 'Backspace') {
            chatDraft = chatDraft.slice(0, -1);
            e.preventDefault();
        } else if (e.key.length === 1 && chatDraft.length < 50) {
            chatDraft += e.key;
            e.preventDefault();
        }
        return;
    }

    const input = {};
    if (e.key === 'a') input.left = true;
    if (e.key === 'd') input.right = true;
    if (e.key === 'w') input.up = true;
    if (e.key === 's') input.down = true;
    if (e.key === ' ') input.jump = true;
    socket.emit('input', input);
});

document.addEventListener('keyup', (e) => {
    if (!gameState || gameState.state !== 'playing' || isChatting) return;

    const input = {};
    if (e.key === 'a') input.left = false;
    if (e.key === 'd') input.right = false;
    if (e.key === 'w') input.up = false;
    if (e.key === 's') input.down = false;
    if (e.key === ' ') input.jump = false;
    socket.emit('input', input);
});

canvas.addEventListener('click', (e) => {
    if (!gameState || gameState.state !== 'playing' || isChatting) return;
    const rect = canvas.getBoundingClientRect();
    const ropeX = (e.clientX - rect.left) / scaleFactor;
    const ropeY = (e.clientY - rect.top) / scaleFactor;
    socket.emit('input', { rope: true, ropeX, ropeY });
    setTimeout(() => socket.emit('input', { rope: false }), 100);
});

// Chat Functions
function startChat() {
    if (!gameState.players.find(p => p.id === myId)) return;
    isChatting = true;
    chatDraft = '';
}

function sendChat() {
    if (chatDraft.trim()) {
        socket.emit('input', { chat: chatDraft.trim() });
    }
    stopChat();
}

function stopChat() {
    isChatting = false;
    chatDraft = '';
}

// Rendering Functions
function renderAimingTool(player) {
    if (!isAiming || player.id !== myId) return;

    const timeHeld = (Date.now() - aimStartTime) / 1000; // In seconds
    const power = Math.min(timeHeld / 0.75, 1); // 0 to 1 over 0.75s
    const baseSpacing = 10;
    const baseSize = 2;
    const maxScale = 3;

    const dx = cursorX - player.x;
    const dy = cursorY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const directionX = dx / dist;
    const directionY = dy / dist;

    const spacing = baseSpacing + power * (baseSpacing * maxScale);
    const size = baseSize + power * (baseSize * maxScale);

    ctx.fillStyle = 'red';
    for (let i = 0; i < 3; i++) {
        const offset = (i + 1) * spacing;
        const x = player.x + directionX * offset;
        const y = player.y + directionY * offset;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function updateCoinData() {
    const now = Date.now();
    gameState.coins.forEach((coin, index) => {
        if (!coinData.has(index)) {
            const angle = Math.random() * 2 * Math.PI;
            const rotation = Math.random() * 2 * Math.PI;
            const pixels = [];
            for (let pi = 0; pi < 10; pi++) {
                for (let pj = 0; pj < 10; pj++) {
                    const cellX = pi * 5;
                    const cellY = pj * 5;
                    const cx = cellX + 2.5;
                    const cy = cellY + 2.5;
                    const dx = cx - 25;
                    const dy = cy - 25;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 25) pixels.push({ x: cellX, y: cellY });
                }
            }
            const pixelOrder = [...pixels];
            for (let k = pixelOrder.length - 1; k > 0; k--) {
                const l = Math.floor(Math.random() * (k + 1));
                [pixelOrder[k], pixelOrder[l]] = [pixelOrder[l], pixelOrder[k]];
            }
            coinData.set(index, {
                angle,
                rotation,
                totalPixels: pixels.length,
                pixelOrder,
                lastUpdate: now
            });
        } else {
            const data = coinData.get(index);
            const dt = (now - data.lastUpdate) / 1000;
            data.angle += SPIN_SPEED * dt;
            data.rotation += ROTATION_SPEED * dt;
            data.lastUpdate = now;
        }
    });
    for (let key of coinData.keys()) {
        if (key >= gameState.coins.length) coinData.delete(key);
    }
}

function renderCoin(coin, index) {
    const data = coinData.get(index);
    if (!data) return;

    const coinCanvas = document.createElement('canvas');
    coinCanvas.width = 50;
    coinCanvas.height = 50;
    const coinCtx = coinCanvas.getContext('2d');

    const scaleX = Math.cos(data.angle);

    coinCtx.save();
    coinCtx.translate(25, 25);
    coinCtx.scale(scaleX, 1);

    coinCtx.fillStyle = 'gold';
    coinCtx.beginPath();
    coinCtx.arc(0, 0, 25, 0, 2 * Math.PI);
    coinCtx.fill();
    coinCtx.restore();

    if (coin.lifetime > 0) {
        const timeElapsed = COIN_LIFETIME * 1000 - coin.lifetime;
        const pixelsToRemove = Math.floor(timeElapsed / (COIN_LIFETIME * 1000 / data.totalPixels));
        const visibleCount = Math.max(0, data.totalPixels - pixelsToRemove);
        if (visibleCount < data.pixelOrder.length) {
            coinCtx.save();
            coinCtx.translate(25, 25);
            coinCtx.scale(scaleX, 1);
            for (let i = data.pixelOrder.length - 1; i >= visibleCount; i--) {
                const pixel = data.pixelOrder[i];
                coinCtx.clearRect(pixel.x - 25, pixel.y - 25, 5, 5);
            }
            coinCtx.restore();
        }
    }

    coinCtx.save();
    coinCtx.translate(25, 25);
    coinCtx.scale(scaleX, 1);
    const sinAngle = Math.sin(data.angle);
    const leftLineWidth = Math.max(0, 0.5 - 2.5 * sinAngle);
    const rightLineWidth = Math.max(0, 0.5 + 2.5 * sinAngle);
    coinCtx.strokeStyle = 'black';
    coinCtx.lineWidth = rightLineWidth;
    coinCtx.beginPath();
    coinCtx.arc(0, 0, 25, 0, Math.PI / 2);
    coinCtx.stroke();
    coinCtx.lineWidth = leftLineWidth;
    coinCtx.beginPath();
    coinCtx.arc(0, 0, 25, Math.PI / 2, 3 * Math.PI / 2);
    coinCtx.stroke();
    coinCtx.lineWidth = rightLineWidth;
    coinCtx.beginPath();
    coinCtx.arc(0, 0, 25, 3 * Math.PI / 2, 2 * Math.PI);
    coinCtx.stroke();
    coinCtx.restore();

    ctx.save();
    ctx.translate(coin.x, coin.y);
    ctx.rotate(data.rotation);
    ctx.drawImage(coinCanvas, -COIN_RADIUS, -COIN_RADIUS, 2 * COIN_RADIUS, 2 * COIN_RADIUS);
    ctx.restore();
}

function wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + ' ' + word).width;
        if (width < maxWidth) {
            currentLine += ' ' + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

function renderProjectile(proj) {
    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.rotate(proj.rotation);

    const SPIN_SPEED = 2 * Math.PI;
    const STRIPE_WIDTH = 5;
    const spinAngle = (Date.now() / 1000 * SPIN_SPEED) % (2 * Math.PI);
    const offset = (spinAngle / (2 * Math.PI)) * (2 * STRIPE_WIDTH);

    for (let y = -PROJECTILE_HEIGHT / 2; y < PROJECTILE_HEIGHT / 2; y++) {
        const patternY = ((y - offset) % (2 * STRIPE_WIDTH) + 2 * STRIPE_WIDTH) % (2 * STRIPE_WIDTH);
        const color = (patternY < STRIPE_WIDTH) ? 'black' : 'white';
        ctx.fillStyle = color;
        ctx.fillRect(-PROJECTILE_WIDTH / 2, y, PROJECTILE_WIDTH, 1);
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(PROJECTILE_WIDTH / 2, 0, PROJECTILE_HEIGHT / 2, -Math.PI / 2, Math.PI / 2);
    ctx.clip();
    for (let y = -PROJECTILE_HEIGHT / 2; y < PROJECTILE_HEIGHT / 2; y++) {
        const patternY = ((y - offset) % (2 * STRIPE_WIDTH) + 2 * STRIPE_WIDTH) % (2 * STRIPE_WIDTH);
        const color = (patternY < STRIPE_WIDTH) ? 'white' : 'black';
        ctx.fillStyle = color;
        ctx.fillRect(PROJECTILE_WIDTH / 2 - PROJECTILE_HEIGHT / 2, y, PROJECTILE_HEIGHT, 1);
    }
    ctx.restore();

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(-PROJECTILE_WIDTH / 2, -PROJECTILE_HEIGHT / 2, PROJECTILE_WIDTH, PROJECTILE_HEIGHT);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(PROJECTILE_WIDTH / 2, 0, PROJECTILE_HEIGHT / 2, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.restore();
}

function renderImpact(impact) {
    const progress = impact.time / BLAST_DURATION;
    const radius = BLAST_RADIUS * progress;
    const alpha = 1 - progress;
    const fillColor = impact.color === 'black' ? `rgba(0, 0, 0, ${alpha})` : `rgba(255, 100, 0, ${alpha})`;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
}

function render() {
    if (!gameState) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(scaleFactor, scaleFactor);

    // Draw non-playable areas
    ctx.fillStyle = 'grey';

    // Top area (above ceiling)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i < gameState.terrain.x.length; i++) {
        ctx.lineTo(gameState.terrain.x[i], gameState.terrain.yCeiling[i]);
    }
    ctx.lineTo(VIRTUAL_WIDTH, 0);
    ctx.closePath();
    ctx.fill();

    // Bottom area (below floor)
    ctx.beginPath();
    ctx.moveTo(0, VIRTUAL_HEIGHT);
    for (let i = 0; i < gameState.terrain.x.length; i++) {
        ctx.lineTo(gameState.terrain.x[i], gameState.terrain.yFloor[i]);
    }
    ctx.lineTo(VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // Draw terrain
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2 / scaleFactor;
    for (let i = 0; i < gameState.terrain.x.length - 1; i++) {
        ctx.beginPath();
        ctx.moveTo(gameState.terrain.x[i], gameState.terrain.yFloor[i]);
        ctx.lineTo(gameState.terrain.x[i + 1], gameState.terrain.yFloor[i + 1]);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gameState.terrain.x[i], gameState.terrain.yCeiling[i]);
        ctx.lineTo(gameState.terrain.x[i + 1], gameState.terrain.yCeiling[i + 1]);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, gameState.terrain.yCeiling[0]);
    ctx.lineTo(0, gameState.terrain.yFloor[0]);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(VIRTUAL_WIDTH, gameState.terrain.yCeiling[gameState.terrain.x.length - 1]);
    ctx.lineTo(VIRTUAL_WIDTH, gameState.terrain.yFloor[gameState.terrain.x.length - 1]);
    ctx.stroke();

    // Draw coins only in Goldrush mode
    if (gameState.gameMode === 'goldrush') {
        gameState.coins.forEach((coin, index) => renderCoin(coin, index));
    }

    // Draw projectiles
    if (gameState.projectiles) {
        gameState.projectiles.forEach(proj => renderProjectile(proj));
    }

    // Draw impacts
    if (gameState.impacts) {
        gameState.impacts.forEach(impact => renderImpact(impact));
    }

    const now = Date.now();
    if (now - lastBlinkTime > 500) {
        cursorVisible = !cursorVisible;
        lastBlinkTime = now;
    }

    // Draw players, ropes, and chat
    gameState.players.forEach(player => {
        renderAimingTool(player);
        if (player.rope.state !== 'none') {
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1 / scaleFactor;
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            if (player.rope.state === 'attached') {
                ctx.lineTo(player.rope.tx, player.rope.ty);
            } else {
                ctx.lineTo(player.rope.x, player.rope.y);
            }
            ctx.stroke();
        }

        ctx.save();
        ctx.translate(player.x, player.y);
        if (player.isDying) {
            const scale = 1 - Math.pow(player.deathAnimationProgress, 2);
            ctx.scale(scale, scale);
        }
        ctx.rotate(player.rotation);

    // Set fill color based on team
    if (gameState.gameMode === 'teamDeathmatch') {
        ctx.fillStyle = player.team === 'red' ? 'red' : 'blue';
      } else {
        ctx.fillStyle = 'white';
      }
  
      // Draw filled circle
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS, 0, 2 * Math.PI);
      ctx.fill();
  
      // Optional: Keep outline for clarity
      ctx.setLineDash([5 / scaleFactor, 5 / scaleFactor]);
      ctx.strokeStyle = 'black'; // Changed to black for visibility
      ctx.stroke();
      ctx.setLineDash([]);
  
      ctx.restore();

        // Draw name and health indicator
        ctx.fillStyle = 'black';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.displayName, player.x, player.y - 15);
        ctx.fillText(`Health: ${Math.max(0, Math.ceil(player.health))}%`, player.x, player.y - 25);

        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        const baseChatY = player.y - 25;

        if (player.id === myId && isChatting) {
            const displayText = chatDraft + (cursorVisible ? '|' : '');
            ctx.fillStyle = 'grey';
            ctx.fillText(displayText, player.x, baseChatY);
        }

        if (player.chatMessages && player.chatMessages.length > 0) {
            const visibleMessages = player.chatMessages.slice(0, MAX_CHAT_MESSAGES);
            visibleMessages.forEach((msg, index) => {
                const age = (now - msg.timestamp) / 1000;
                let alpha = 1;
                if (age > 5) {
                    alpha = Math.max(0, 1 - (age - 5) / 0.5);
                }
                ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
                const yOffset = baseChatY - (index + 1) * CHAT_LINE_HEIGHT;
                ctx.fillText(msg.text, player.x, yOffset);
            });
        }
    });

    // Draw chat log
    if (gameState.chatHistory && gameState.chatHistory.length > 0) {
        ctx.font = `${CHAT_FONT_SIZE}px Arial`;
        const availableHeight = CHAT_LOG_BOTTOM - CHAT_LOG_TOP;
        let totalHeight = 0;
        const messagesToRender = [];
        for (let i = 0; i < gameState.chatHistory.length; i++) {
            const message = gameState.chatHistory[i];
            const lines = wrapText(message.text, maxMessageWidth);
            const messageHeight = lines.length * CHAT_LINE_HEIGHT;
            if (totalHeight + messageHeight > availableHeight) break;
            messagesToRender.push({message, lines});
            totalHeight += messageHeight;
        }
        let y = CHAT_LOG_BOTTOM - totalHeight;
        const usernameX = CHAT_LOG_X - 5;
        const messageX = CHAT_LOG_X;
        for (const {message, lines} of [...messagesToRender].reverse()) {
            ctx.textAlign = 'right';
            ctx.fillStyle = 'black';
            ctx.fillText(message.sender + ':', usernameX, y);
            ctx.textAlign = 'left';
            lines.forEach((line, index) => {
                ctx.fillText(line, messageX, y + index * CHAT_LINE_HEIGHT);
            });
            y += lines.length * CHAT_LINE_HEIGHT;
        }
    }

    if (gameState.state === 'playing') {
        ctx.font = `${20 * scaleFactor}px Consolas`;
        ctx.fillStyle = 'black';
        ctx.textAlign = 'left';
        const timeText = gameState.timer === Infinity ? 'Time: ∞' : `Time: ${Math.ceil(gameState.timer / 1000)}s`;
        ctx.fillText(timeText, 10, 30);
    
        if (gameState.gameMode === 'teamDeathmatch') {
            ctx.fillText(`Red Team: ${gameState.redTeamScore}`, 10, 60);
            ctx.fillText(`Blue Team: ${gameState.blueTeamScore}`, 10, 90);
        } else {
          const scoreLabel = gameState.gameMode === 'deathmatch' ? 'Kills' : 'Coins';
          gameState.players.forEach((player, index) => {
            ctx.fillText(`${player.displayName}: ${player.score} ${scoreLabel}`, 10, 60 + index * 30);
          });
        }
      } else if (gameState.state === 'gameOver') {
        ctx.font = `${40 * scaleFactor}px Consolas`;
        ctx.fillStyle = 'red';
        ctx.textAlign = 'center';
        if (gameState.gameMode === 'teamDeathmatch' && gameState.winner) {
          ctx.fillText(
            gameState.winner === 'red' ? 'Red Team Wins!' : 
            gameState.winner === 'blue' ? 'Blue Team Wins!' : 'It\'s a Tie!',
            VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 - 50
          );
          ctx.font = `${20 * scaleFactor}px Consolas`;
          ctx.fillText(`Red Team: ${gameState.redTeamScore}`, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 30);
          ctx.fillText(`Blue Team: ${gameState.blueTeamScore}`, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 60);
        } else {
          ctx.fillText('Game Over', VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 - 50);
        }
    
        ctx.font = `${20 * scaleFactor}px Consolas`;
        if (gameState.gameMode === 'teamDeathmatch') {
          let redScore = 0, blueScore = 0;
          gameState.players.forEach(p => {
            if (p.team === 'red') redScore += p.score;
            else if (p.team === 'blue') blueScore += p.score;
          });
          ctx.fillText(`Red Team: ${redScore}`, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 30);
          ctx.fillText(`Blue Team: ${blueScore}`, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 60);
        } else {
          const scoreLabel = gameState.gameMode === 'deathmatch' ? 'Kills' : 'Coins';
          gameState.players.forEach((player, index) => {
            ctx.fillText(`${player.displayName}: ${player.score} ${scoreLabel}`, 
              VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 30 + index * 30);
          });
        }
      }
    
      ctx.restore();
    }

// Initialize the Room Browser
showRoomBrowser();