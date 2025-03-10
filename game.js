// game.js (Server-side)

// Constants
const PLAYER_SPEED = 100;
const AIR_ACCELERATION = 500;
const AIR_FRICTION = 50;
const GROUND_ACCELERATION = 1000;
const GROUND_FRICTION = 100;
const MAX_SPEED_ALONG_SLOPE = 150;
const ROPE_SPEED = 1200;
const ROPE_MAX_LENGTH = 450;
const GAME_DURATION = 60000;
const WIDTH = 800;
const HEIGHT = 400;
const N_TERRAIN_SEGMENTS = 25;
const PLAYER_RADIUS = 10;
const COIN_RADIUS = 14;
const GRAVITY = 400;
const SWING_ACCELERATION = 600;
const ROPE_LENGTH_CHANGE_SPEED = 300;
const MIN_ROPE_LENGTH = 0;
const MAX_ROPE_LENGTH = 500;
const JUMP_VELOCITY = -300;
const COIN_LIFETIME = 5;
const COIN_SPAWN_INTERVAL = 2;
const COLLISION_ENERGY_LOSS = 0.5;
const CHAT_MESSAGE_LIFETIME = 5000;
const CHAT_FADE_DURATION = 500;
const MAX_CHAT_MESSAGES = 5;

// Simple noise function for terrain generation
function generateNoise(n, k) {
  const noise = new Array(n + 1);
  const m = Math.floor(n / k);
  for (let j = 0; j <= m; j++) noise[j * k] = Math.random();
  if (n % k !== 0) noise[n] = Math.random();
  for (let j = 0; j < m; j++) {
    let start = j * k, end = (j + 1) * k;
    for (let i = 1; i < k; i++) {
      let t = i / k;
      noise[start + i] = (1 - t) * noise[start] + t * noise[end];
    }
  }
  if (n % k !== 0) {
    let start = m * k, num = n - start;
    for (let i = 1; i < num; i++) {
      let t = i / num;
      noise[start + i] = (1 - t) * noise[start] + t * noise[n];
    }
  }
  return noise;
}

function lineLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (denom === 0) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }
  return null;
}

class Game {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = {};
    this.coins = [];
    this.state = 'playing';
    this.timer = GAME_DURATION;
    this.x = [];
    this.yFloor = [];
    this.yCeiling = [];
    this.terrainLines = [];
    this.coinSpawnTimer = COIN_SPAWN_INTERVAL * 1000;
    this.generateTerrain();
    this.spawnCoin();
  }

  generateTerrain() {
    this.x = Array.from({ length: N_TERRAIN_SEGMENTS + 1 }, (_, i) => i * (WIDTH / N_TERRAIN_SEGMENTS));
    const yMid = this.x.map((_, i) => HEIGHT / 2 + (generateNoise(N_TERRAIN_SEGMENTS, 5)[i] - 0.5) * (HEIGHT / 1.5));
    const h = this.x.map((_, i) => 300 + generateNoise(N_TERRAIN_SEGMENTS, 5)[i] * 100);
    this.yFloor = yMid.map((ym, i) => Math.min(HEIGHT - PLAYER_RADIUS, ym + h[i] / 2));
    this.yCeiling = yMid.map((ym, i) => Math.max(PLAYER_RADIUS, ym - h[i] / 2));
    this.terrainLines = [];
    for (let i = 0; i < N_TERRAIN_SEGMENTS; i++) {
      this.terrainLines.push({ p1: { x: this.x[i], y: this.yFloor[i] }, p2: { x: this.x[i + 1], y: this.yFloor[i + 1] } });
      this.terrainLines.push({ p1: { x: this.x[i], y: this.yCeiling[i] }, p2: { x: this.x[i + 1], y: this.yCeiling[i + 1] } });
    }
    this.terrainLines.push({ p1: { x: 0, y: this.yCeiling[0] }, p2: { x: 0, y: this.yFloor[0] } });
    this.terrainLines.push({ p1: { x: WIDTH, y: this.yCeiling[N_TERRAIN_SEGMENTS] }, p2: { x: WIDTH, y: this.yFloor[N_TERRAIN_SEGMENTS] } });
  }

  getFloorYAt(x) {
    const i = Math.min(Math.floor(x / (WIDTH / N_TERRAIN_SEGMENTS)), N_TERRAIN_SEGMENTS - 1);
    const t = (x - this.x[i]) / (this.x[i + 1] - this.x[i]);
    return this.yFloor[i] + t * (this.yFloor[i + 1] - this.yFloor[i]);
  }

  getCeilingYAt(x) {
    const i = Math.min(Math.floor(x / (WIDTH / N_TERRAIN_SEGMENTS)), N_TERRAIN_SEGMENTS - 1);
    const t = (x - this.x[i]) / (this.x[i + 1] - this.x[i]);
    return this.yCeiling[i] + t * (this.yCeiling[i + 1] - this.yCeiling[i]);
  }

  getSlopeAngleAt(x) {
    const i = Math.min(Math.floor(x / (WIDTH / N_TERRAIN_SEGMENTS)), N_TERRAIN_SEGMENTS - 1);
    const dx = this.x[i + 1] - this.x[i];
    const dy = this.yFloor[i + 1] - this.yFloor[i];
    return Math.atan2(dy, dx);
  }

  spawnCoin() {
    const coinX = Math.random() * (WIDTH - 20) + 10;
    const i = Math.min(Math.floor(coinX / (WIDTH / N_TERRAIN_SEGMENTS)), N_TERRAIN_SEGMENTS - 1);
    const t = (coinX - this.x[i]) / (this.x[i + 1] - this.x[i]);
    const ceilY = this.yCeiling[i] + t * (this.yCeiling[i + 1] - this.yCeiling[i]);
    const floorY = this.yFloor[i] + t * (this.yFloor[i + 1] - this.yFloor[i]);
    const margin = PLAYER_RADIUS + COIN_RADIUS;
    const coinY = ceilY + margin + Math.random() * (floorY - ceilY - 2 * margin);
    this.coins.push({
      x: coinX,
      y: coinY,
      lifetime: COIN_LIFETIME * 1000
    });
  }

  addPlayer(id, displayName) {
    this.players[id] = {
      id,
      displayName,
      x: WIDTH / 4,
      y: this.getFloorYAt(WIDTH / 4) - PLAYER_RADIUS,
      vx: 0,
      vy: 0,
      score: 0,
      rotation: 0,
      input: { left: false, right: false, up: false, down: false, jump: false, rope: false, ropeX: 0, ropeY: 0, chat: null },
      rope: { state: 'none', x: 0, y: 0, tx: 0, ty: 0, length: 0, dx: 0, dy: 0 },
      chatMessages: [],
      nextMessageId: 0,
      onGround: false,
      lastRopeInput: false,
      lastJumpInput: false
    };
  }

  removePlayer(id) {
    delete this.players[id];
  }

  handleInput(id, input) {
    if (this.players[id]) {
      const player = this.players[id];
      player.input = { ...player.input, ...input };
      if (input.chat) {
        const message = {
          id: player.nextMessageId++,
          text: input.chat,
          timestamp: Date.now(),
          fadeNow: false
        };
        player.chatMessages.unshift(message);
        if (player.chatMessages.length > MAX_CHAT_MESSAGES) {
          player.chatMessages.slice(0, MAX_CHAT_MESSAGES - 1).forEach(msg => msg.fadeNow = true);
          player.chatMessages = player.chatMessages.slice(0, MAX_CHAT_MESSAGES);
        }
      }
    }
  }

  update(dt) {
    if (this.state !== 'playing') return;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.state = 'gameOver';
      return;
    }

    this.coinSpawnTimer -= dt;
    if (this.coinSpawnTimer <= 0) {
      this.spawnCoin();
      this.coinSpawnTimer = COIN_SPAWN_INTERVAL * 1000;
    }

    const dtSeconds = dt / 1000;

    // Update coins' lifetime
    this.coins.forEach(coin => {
      coin.lifetime -= dt;
    });

    // Update each player
    for (const id in this.players) {
      const player = this.players[id];
      const input = player.input;

      const wasOnGround = player.onGround;

      // Rope firing from player's center
      if (player.rope.state === 'none' && input.rope && !player.lastRopeInput) {
        player.rope.state = 'firing';
        player.rope.x = player.x;
        player.rope.y = player.y;
        const dx = input.ropeX - player.rope.x;
        const dy = input.ropeY - player.rope.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        player.rope.dx = (dx / len) * ROPE_SPEED;
        player.rope.dy = (dy / len) * ROPE_SPEED;
        player.rope.length = 0;
      }

      if (player.rope.state === 'firing') {
        player.rope.x += player.rope.dx * dtSeconds;
        player.rope.y += player.rope.dy * dtSeconds;
        player.rope.length += ROPE_SPEED * dtSeconds;

        for (let i = 0; i < this.terrainLines.length; i++) {
          const line = this.terrainLines[i];
          const intersect = lineLineIntersection(
            player.x, player.y,
            player.rope.x, player.rope.y,
            line.p1.x, line.p1.y,
            line.p2.x, line.p2.y
          );
          if (intersect) {
            player.rope.state = 'attached';
            player.rope.tx = intersect.x;
            player.rope.ty = intersect.y;
            player.rope.length = Math.sqrt(
              (player.x - intersect.x) ** 2 + (player.y - intersect.y) ** 2
            ) - PLAYER_RADIUS;
            break;
          }
        }

        if (player.rope.length >= ROPE_MAX_LENGTH) {
          player.rope.state = 'none';
        }
      }

      if (player.rope.state === 'attached') {
        const dx = player.x - player.rope.tx;
        const dy = player.y - player.rope.ty;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ropeDirX = dx / dist;
        const ropeDirY = dy / dist;
        const tangentX = -ropeDirY;
        const tangentY = ropeDirX;

        if (input.up) {
          player.rope.length -= ROPE_LENGTH_CHANGE_SPEED * dtSeconds;
          player.rope.length = Math.max(MIN_ROPE_LENGTH, player.rope.length);
        } else if (input.down) {
          player.rope.length += ROPE_LENGTH_CHANGE_SPEED * dtSeconds;
          player.rope.length = Math.min(MAX_ROPE_LENGTH, player.rope.length);
        }

        const gravityTangent = GRAVITY * tangentY;
        player.vx += gravityTangent * tangentX * dtSeconds;
        player.vy += gravityTangent * tangentY * dtSeconds;

        let inputAccel = 0;
        if (input.left) inputAccel = -SWING_ACCELERATION;
        else if (input.right) inputAccel = SWING_ACCELERATION;
        const inputTangent = inputAccel * tangentX;
        player.vx += inputTangent * tangentX * dtSeconds;
        player.vy += inputTangent * tangentY * dtSeconds;

        const tangentSpeed = player.vx * tangentX + player.vy * tangentY;

        const prevX = player.x;
        const prevY = player.y;
        player.x += player.vx * dtSeconds;
        player.y += player.vy * dtSeconds;

        const newDx = player.x - player.rope.tx;
        const newDy = player.y - player.rope.ty;
        const newDist = Math.sqrt(newDx * newDx + newDy * newDy);
        const effectiveLength = player.rope.length + PLAYER_RADIUS;
        if (newDist > 0) {
          player.x = player.rope.tx + (newDx / newDist) * effectiveLength;
          player.y = player.rope.ty + (newDy / newDist) * effectiveLength;
        }

        player.vx = tangentSpeed * tangentX;
        player.vy = tangentSpeed * tangentY;

        player.rotation = Math.atan2(-tangentX, -tangentY);

        if ((input.jump && !player.lastJumpInput) || (input.rope && !player.lastRopeInput)) {
          player.rope.state = 'none';
        }
      } else {
        if (wasOnGround) {
          const theta = this.getSlopeAngleAt(player.x);
          const a_grav_x = GRAVITY * Math.sin(theta);
          let a_input = 0;
          if (input.left) a_input = -GROUND_ACCELERATION;
          else if (input.right) a_input = GROUND_ACCELERATION;

          player.vx += (a_input + a_grav_x) * dtSeconds;

          if (a_input === 0) {
            const friction = GROUND_FRICTION * dtSeconds;
            if (Math.abs(player.vx) <= friction) player.vx = 0;
            else if (player.vx > 0) player.vx -= friction;
            else player.vx += friction;
          }

          const maxVx = MAX_SPEED_ALONG_SLOPE * Math.cos(theta);
          if (player.vx > maxVx) player.vx = maxVx;
          else if (player.vx < -maxVx) player.vx = -maxVx;

          player.vy = player.vx * Math.tan(theta);

          if (input.jump && !player.lastJumpInput) {
            player.vy = JUMP_VELOCITY;
            player.onGround = false;
          }

          player.rotation += (player.vx * dtSeconds) / PLAYER_RADIUS;
        } else {
          if (input.left) player.vx -= AIR_ACCELERATION * dtSeconds;
          else if (input.right) player.vx += AIR_ACCELERATION * dtSeconds;
          const friction = AIR_FRICTION * dtSeconds;
          if (player.vx > 0) player.vx = Math.max(0, player.vx - friction);
          else if (player.vx < 0) player.vx = Math.min(0, player.vx + friction);

          const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
          player.rotation += (speed * dtSeconds) / PLAYER_RADIUS;
        }
        player.vy += GRAVITY * dtSeconds;
        player.x += player.vx * dtSeconds;
        player.y += player.vy * dtSeconds;
      }

      if (player.x < PLAYER_RADIUS) {
        player.x = PLAYER_RADIUS;
        if (player.vx < 0) player.vx = -player.vx * COLLISION_ENERGY_LOSS;
      } else if (player.x > WIDTH - PLAYER_RADIUS) {
        player.x = WIDTH - PLAYER_RADIUS;
        if (player.vx > 0) player.vx = -player.vx * COLLISION_ENERGY_LOSS;
      }

      const floorY = this.getFloorYAt(player.x);
      if (player.y > floorY - PLAYER_RADIUS) {
        player.y = floorY - PLAYER_RADIUS;
        if (player.rope.state === 'attached') {
          if (player.vy > 0) player.vy = -player.vy * COLLISION_ENERGY_LOSS;
        } else {
          player.vy = 0;
          player.onGround = true;
        }
      } else {
        player.onGround = false;
      }

      const ceilingY = this.getCeilingYAt(player.x);
      if (player.y < ceilingY + PLAYER_RADIUS) {
        player.y = ceilingY + PLAYER_RADIUS;
        if (player.vy < 0) player.vy = -player.vy * COLLISION_ENERGY_LOSS;
        player.onGround = false;
      }

      player.lastRopeInput = input.rope;
      player.lastJumpInput = input.jump;
    }

    // Handle coin collection after player updates
    this.coins = this.coins.filter(coin => {
      let keep = true;
      for (const id in this.players) {
        const player = this.players[id];
        const dx = player.x - coin.x;
        const dy = player.y - coin.y;
        if (dx * dx + dy * dy < (PLAYER_RADIUS + COIN_RADIUS) ** 2) {
          player.score += 1;
          keep = false;
          break;
        }
      }
      return keep && coin.lifetime > 0;
    });
  }

  reset() {
    this.generateTerrain();
    this.state = 'playing';
    this.timer = GAME_DURATION;
    this.coins = [];
    this.coinSpawnTimer = COIN_SPAWN_INTERVAL * 1000;
    for (const id in this.players) {
      const player = this.players[id];
      player.x = WIDTH / 4;
      player.y = this.getFloorYAt(WIDTH / 4) - PLAYER_RADIUS;
      player.vx = 0;
      player.vy = 0;
      player.score = 0;
      player.rotation = 0;
      player.rope = { state: 'none', x: 0, y: 0, tx: 0, ty: 0, length: 0, dx: 0, dy: 0 };
      player.chatMessages = [];
      player.nextMessageId = 0;
      player.onGround = false;
      player.lastRopeInput = false;
      player.lastJumpInput = false;
    }
    this.spawnCoin();
  }

  getState() {
    return {
      roomId: this.roomId,
      players: Object.values(this.players),
      coins: this.coins,
      state: this.state,
      timer: this.timer,
      terrain: { x: this.x, yFloor: this.yFloor, yCeiling: this.yCeiling }
    };
  }
}

module.exports = Game;