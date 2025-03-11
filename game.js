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
const BAZOOKA_CHARGE_TIME = 2;
const BAZOOKA_MAX_VELOCITY = 600;
const BAZOOKA_MIN_VELOCITY = 200;
const BLAST_RADIUS = 50;
const BLAST_DURATION = 0.3;
const BLAST_KNOCKBACK = 800;
const BAZOOKA_COOLDOWN = 1;

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
  constructor(roomId, duration) {
    this.roomId = roomId;
    this.players = {};
    this.coins = [];
    this.projectiles = [];
    this.blasts = [];
    this.chatHistory = [];
    this.state = 'playing';
    this.timer = duration === Infinity ? Infinity : duration * 1000;
    this.duration = duration;
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
      input: { left: false, right: false, up: false, down: false, jump: false, rope: false, ropeX: 0, ropeY: 0, chat: null, bazooka: false, bazookaX: 0, bazookaY: 0 },
      rope: { state: 'none', x: 0, y: 0, tx: 0, ty: 0, length: 0, dx: 0, dy: 0 },
      bazooka: { charge: 0, lastShot: 0 }, // Initialize lastShot to 0
      chatMessages: [],
      nextMessageId: 0,
      onGround: false,
      lastRopeInput: false,
      lastJumpInput: false,
      lastBazookaInput: false
    };
  }

  removePlayer(id) {
    delete this.players[id];
  }

  handleInput(id, input) {
    if (this.players[id]) {
      const player = this.players[id];
      player.input = { ...player.input, ...input };
      if (input.bazooka !== undefined) {
        console.log(`Player ${id} bazooka input: ${input.bazooka}, x: ${input.bazookaX}, y: ${input.bazookaY}`);
      }
      if (input.chat) {
        const message = {
          id: player.nextMessageId++,
          text: input.chat,
          timestamp: Date.now(),
          sender: player.displayName
        };
        player.chatMessages.unshift(message);
        this.chatHistory.unshift(message);
        if (this.chatHistory.length > 50) this.chatHistory.pop();
      }
    }
  }

  update(dt) {
    if (this.state !== 'playing') return;

    if (this.timer !== Infinity) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'gameOver';
        return;
      }
    }

    this.coinSpawnTimer -= dt;
    if (this.coinSpawnTimer <= 0) {
      this.spawnCoin();
      this.coinSpawnTimer = COIN_SPAWN_INTERVAL * 1000;
    }

    const dtSeconds = dt / 1000;

    this.coins.forEach(coin => coin.lifetime -= dt);

    this.blasts = this.blasts.filter(blast => {
      blast.time += dtSeconds;
      return blast.time < BLAST_DURATION;
    });

    this.projectiles = this.projectiles.filter(proj => {
      proj.x += proj.vx * dtSeconds;
      proj.y += proj.vy * dtSeconds;
      proj.vy += GRAVITY * dtSeconds;

      for (let line of this.terrainLines) {
        const intersect = lineLineIntersection(
          proj.x - proj.vx * dtSeconds, proj.y - proj.vy * dtSeconds,
          proj.x, proj.y,
          line.p1.x, line.p1.y,
          line.p2.x, line.p2.y
        );
        if (intersect) {
          this.blasts.push({ x: intersect.x, y: intersect.y, time: 0 });
          return false;
        }
      }

      for (let id in this.players) {
        const player = this.players[id];
        if (player.id !== proj.owner) {
          const dx = player.x - proj.x;
          const dy = player.y - proj.y;
          if (dx * dx + dy * dy < PLAYER_RADIUS * PLAYER_RADIUS) {
            this.blasts.push({ x: proj.x, y: proj.y, time: 0 });
            return false;
          }
        }
      }

      return proj.x >= 0 && proj.x <= WIDTH && proj.y >= 0 && proj.y <= HEIGHT;
    });

    for (const id in this.players) {
      const player = this.players[id];
      const input = player.input;

      const wasOnGround = player.onGround;

      const now = Date.now();
      if (input.bazooka && !player.lastBazookaInput && (now - player.bazooka.lastShot) >= BAZOOKA_COOLDOWN * 1000) {
        player.bazooka.charge += dtSeconds;
        console.log(`Player ${id} charging bazooka: ${player.bazooka.charge}`);
        if (player.bazooka.charge > BAZOOKA_CHARGE_TIME) player.bazooka.charge = 0;
      } else if (!input.bazooka && player.lastBazookaInput && player.bazooka.charge > 0) {
        const chargeRatio = Math.min(player.bazooka.charge / BAZOOKA_CHARGE_TIME, 1);
        const velocity = BAZOOKA_MIN_VELOCITY + chargeRatio * (BAZOOKA_MAX_VELOCITY - BAZOOKA_MIN_VELOCITY);
        const dx = input.bazookaX - player.x;
        const dy = input.bazookaY - player.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) { // Prevent division by zero
          this.projectiles.push({
            x: player.x,
            y: player.y,
            vx: (dx / len) * velocity,
            vy: (dy / len) * velocity,
            owner: id
          });
          console.log(`Player ${id} fired bazooka: velocity=${velocity}, projectiles=${this.projectiles.length}`);
          player.bazooka.lastShot = now;
          player.bazooka.charge = 0;
        }
      }

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

      for (let blast of this.blasts) {
        const dx = player.x - blast.x;
        const dy = player.y - blast.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < BLAST_RADIUS) {
          const force = BLAST_KNOCKBACK * (1 - dist / BLAST_RADIUS);
          const dirX = dx / dist || 0;
          const dirY = dy / dist || 0;
          player.vx += dirX * force;
          player.vy += dirY * force;
          if (player.rope.state === 'attached') player.rope.state = 'none';
        }
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
      player.lastBazookaInput = input.bazooka;
    }

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
    this.timer = this.duration === Infinity ? Infinity : this.duration * 1000;
    this.coins = [];
    this.projectiles = [];
    this.blasts = [];
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
      player.bazooka = { charge: 0, lastShot: 0 };
      player.chatMessages = [];
      player.nextMessageId = 0;
      player.onGround = false;
      player.lastRopeInput = false;
      player.lastJumpInput = false;
      player.lastBazookaInput = false;
    }
    this.spawnCoin();
  }

  getState() {
    return {
      roomId: this.roomId,
      players: Object.values(this.players),
      coins: this.coins,
      projectiles: this.projectiles,
      blasts: this.blasts,
      chatHistory: this.chatHistory,
      state: this.state,
      timer: this.timer,
      duration: this.duration,
      terrain: { x: this.x, yFloor: this.yFloor, yCeiling: this.yCeiling }
    };
  }
}

module.exports = Game;