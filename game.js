// game.js (Server-side)

// Constants
const PLAYER_SPEED = 100;
const AIR_ACCELERATION = 300;
const AIR_FRICTION = 50;
const GROUND_ACCELERATION = 1300;
const GROUND_FRICTION = 100;
const MAX_SPEED_ALONG_SLOPE = 500;
const ROPE_SPEED = 1350;
const ROPE_MAX_LENGTH = 300;

// Map and Terrain Constants
const WIDTH = 1600;                    // Width of the game canvas
const HEIGHT = 800;                   // Height of the game canvas
const N_TERRAIN_SEGMENTS = 48;        // Number of terrain segments (controls horizontal resolution)
const MIN_CAVE_HEIGHT = 250;
const CENTERLINE_F_MIN = 0.25;
const CENTERLINE_F_MAX = .75;
const CENTERLINE_A_MIN = HEIGHT / 8;
const CENTERLINE_A_MAX = HEIGHT / 4;

// Terrain Generation Constants
const FLOOR_NOISE_AMPLITUDE = 0;    // -10 to 10
const CEILING_NOISE_AMPLITUDE = 30; // -30 TO 30
const HEIGHT_VARIATION_MAX = 600;
const TERRAIN_HEIGHT_VARIATION = 600; // Variation in height between floor and ceiling//
const PLAYER_RADIUS = 10;
const COIN_RADIUS = 14;
const GRAVITY = 400;
const SWING_ACCELERATION = 500;
const ROPE_LENGTH_CHANGE_SPEED = 300;
const MIN_ROPE_LENGTH = 0;
const MAX_ROPE_LENGTH = 420;
const JUMP_VELOCITY = -275;
const COIN_LIFETIME = 5;
const COIN_SPAWN_INTERVAL = 2;
const COLLISION_ENERGY_LOSS = 0.5;
const BAZOOKA_MAX_VELOCITY = 750;
const PROJECTILE_WIDTH = 20;
const PROJECTILE_HEIGHT = 10;
const MAX_PROJECTILES = 50;
const BLAST_RADIUS = 75;
const BLAST_DURATION = 0.25;
const MAX_BLAST_FORCE = 750;

// Simple noise function for terrain generation
function generateNoise(n, k) {
  const noise = new Array(n + 1);
  const m = Math.floor(n / k);
  for (let j = 0; j <= m; j++) noise[j * k] = Math.random();
  if (n % k !== 0) noise[n] = Math.random();
  for (let j = 0; j < m; j++) {
    let start = j * k,
      end = (j + 1) * k;
    for (let i = 1; i < k; i++) {
      let t = i / k;
      noise[start + i] = (1 - t) * noise[start] + t * noise[end];
    }
  }
  if (n % k !== 0) {
    let start = m * k,
      num = n - start;
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
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  }
  return null;
}

class Game {
  constructor(roomId, options) {
    this.roomId = roomId;
    this.gameMode = options.gameMode || 'goldrush';
    this.redTeamScore = this.gameMode === 'teamDeathmatch' ? 0 : undefined;
    this.blueTeamScore = this.gameMode === 'teamDeathmatch' ? 0 : undefined;
    // Enable friendlyFire for both Deathmatch and Team Deathmatch
    this.friendlyFire = (this.gameMode === 'deathmatch' || this.gameMode === 'teamDeathmatch') 
      ? (options.friendlyFire || false) 
      : false;
    this.killLimit = this.gameMode === 'deathmatch' ? (options.killLimit || Infinity) : Infinity;
    this.goldWinLimit = this.gameMode === 'goldrush' ? (options.goldWinLimit || Infinity) : Infinity;
    this.timeLimit = options.timeLimit || Infinity;
    this.timer = this.timeLimit === Infinity ? Infinity : this.timeLimit * 1000;
    this.players = {};
    this.coins = [];
    this.chatHistory = [];
    this.state = 'playing';
    this.x = [];
    this.winner = null;
    this.yFloor = [];
    this.yCeiling = [];
    this.terrainLines = [];
    this.coinSpawnTimer = COIN_SPAWN_INTERVAL * 1000;
    this.generateTerrain();
    if (this.gameMode === 'goldrush') {
      this.spawnCoin();
    }
    this.projectiles = [];
    this.impacts = [];
  }

  generateTerrain() {
    // Generate x-coordinates
    this.x = Array.from(
      { length: N_TERRAIN_SEGMENTS + 1 },
      (_, i) => i * (WIDTH / N_TERRAIN_SEGMENTS)
    );
  
    // Generate centerline parameters
    const f1 = Math.random() * (CENTERLINE_F_MAX - CENTERLINE_F_MIN) + CENTERLINE_F_MIN;
    const f2 = Math.random() * (CENTERLINE_F_MAX - CENTERLINE_F_MIN) + CENTERLINE_F_MIN;
    const A1 = Math.random() * (CENTERLINE_A_MAX - CENTERLINE_A_MIN) + CENTERLINE_A_MIN;
    const A2 = Math.random() * (CENTERLINE_A_MAX - CENTERLINE_A_MIN) + CENTERLINE_A_MIN;
    const phi1 = Math.random() * 2 * Math.PI;
    const phi2 = Math.random() * 2 * Math.PI;
  
    // Compute centerline
    const y_center = this.x.map(x =>
      HEIGHT / 2 + A1 * Math.cos(2 * Math.PI * f1 * x / WIDTH + phi1) +
                   A2 * Math.cos(2 * Math.PI * f2 * x / WIDTH + phi2)
    );
  
    // Generate noise arrays (assuming generateNoise returns 0 to 1)
    const floor_noise = generateNoise(N_TERRAIN_SEGMENTS, 2)
      .map(n => (n - 0.5) * 2 * FLOOR_NOISE_AMPLITUDE); // -10 to 10
    const ceiling_noise = generateNoise(N_TERRAIN_SEGMENTS, 2)
      .map(n => (n - 0.5) * 2 * CEILING_NOISE_AMPLITUDE); // -30 to 30
    const height_variation = generateNoise(N_TERRAIN_SEGMENTS, 5); // 0 to 1, smoother
  
    // Compute floor and ceiling
    this.yFloor = [];
    this.yCeiling = [];
    for (let i = 0; i <= N_TERRAIN_SEGMENTS; i++) {
      const h_base = MIN_CAVE_HEIGHT + height_variation[i] * HEIGHT_VARIATION_MAX;
    
      // Correctly position ceiling above and floor below the centerline
      let y_ceiling_temp = y_center[i] - (h_base / 2) + ceiling_noise[i];
      let y_floor_temp = y_center[i] + (h_base / 2) + floor_noise[i];
    
      // Clamp to screen bounds (e.g., leave space for player)
      y_ceiling_temp = Math.max(PLAYER_RADIUS, y_ceiling_temp);
      y_floor_temp = Math.min(HEIGHT - PLAYER_RADIUS, y_floor_temp);
    
      // Ensure minimum cave height
      if (y_floor_temp - y_ceiling_temp < MIN_CAVE_HEIGHT) {
        y_ceiling_temp = Math.max(PLAYER_RADIUS, y_floor_temp - MIN_CAVE_HEIGHT);
        // If ceiling hits top boundary, adjust floor instead
        if (y_ceiling_temp === PLAYER_RADIUS) {
          y_floor_temp = y_ceiling_temp + MIN_CAVE_HEIGHT;
          y_floor_temp = Math.min(y_floor_temp, HEIGHT - PLAYER_RADIUS);
        }
      }
    
      this.yCeiling[i] = y_ceiling_temp;
      this.yFloor[i] = y_floor_temp;
    }
  
    // Generate terrain lines for collision detection
    this.terrainLines = [];
    for (let i = 0; i < N_TERRAIN_SEGMENTS; i++) {
      this.terrainLines.push({
        p1: { x: this.x[i], y: this.yFloor[i] },
        p2: { x: this.x[i + 1], y: this.yFloor[i + 1] }
      });
      this.terrainLines.push({
        p1: { x: this.x[i], y: this.yCeiling[i] },
        p2: { x: this.x[i + 1], y: this.yCeiling[i + 1] }
      });
    }
    this.terrainLines.push({
      p1: { x: 0, y: this.yCeiling[0] },
      p2: { x: 0, y: this.yFloor[0] }
    });
    this.terrainLines.push({
      p1: { x: WIDTH, y: this.yCeiling[N_TERRAIN_SEGMENTS] },
      p2: { x: WIDTH, y: this.yFloor[N_TERRAIN_SEGMENTS] }
    });
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

  respawnPlayer(id) {
    const player = this.players[id];
    if (!player) return;

    const spawnX = Math.random() * (WIDTH - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;
    const spawnY = this.getFloorYAt(spawnX) - PLAYER_RADIUS;
    player.x = spawnX;
    player.y = spawnY;
    player.vx = 0;
    player.vy = 0;
    player.rope.state = 'none';
    player.onGround = true;
    player.canDoubleJump = false;
    player.isDying = false;
    player.deathAnimationProgress = 0;
    player.health = 100; // Reset health to 100%
  }

  addPlayer(id, displayName) {
    this.players[id] = {
      id,
      displayName,
      team: null, // Default to null for non-team modes
      x: WIDTH / 4,
      y: this.getFloorYAt(WIDTH / 4) - PLAYER_RADIUS,
      vx: 0,
      vy: 0,
      score: 0,
      rotation: 0,
      input: {
        left: false,
        right: false,
        up: false,
        down: false,
        jump: false,
        rope: false,
        ropeX: 0,
        ropeY: 0,
        chat: null
      },
      rope: {
        state: 'none',
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
        length: 0,
        dx: 0,
        dy: 0
      },
      chatMessages: [],
      nextMessageId: 0,
      onGround: false,
      lastRopeInput: false,
      lastJumpInput: false,
      canDoubleJump: false,
      isDying: false,
      deathAnimationProgress: 0,
      deathAnimationDuration: 500,
      health: 100
    };
    if (this.gameMode === 'teamDeathmatch') {
      const redCount = Object.values(this.players).filter(p => p.team === 'red').length;
      const blueCount = Object.values(this.players).filter(p => p.team === 'blue').length;
      if (redCount < blueCount) {
        this.players[id].team = 'red';
      } else if (blueCount < redCount) {
        this.players[id].team = 'blue';
      } else {
        this.players[id].team = Math.random() < 0.5 ? 'red' : 'blue';
      }
    }
  }

  removePlayer(id) {
    delete this.players[id];
  }

  handleInput(id, input) {
    if (this.players[id]) {
      const player = this.players[id];
      player.input = {
        ...player.input,
        ...input
      };
      if (input.type === 'switchTeam' && this.gameMode === 'teamDeathmatch') {
        player.team = player.team === 'red' ? 'blue' : 'red';
      }
      if (input.type === 'bazooka_fire') {
        const existingProj = this.projectiles.find(p => p.ownerId === id);
        if (existingProj) {
          this.handleImpact(existingProj);
          this.projectiles = this.projectiles.filter(p => p !== existingProj);
        } else if (this.projectiles.length < MAX_PROJECTILES) {
          const velocity = BAZOOKA_MAX_VELOCITY * input.power;
          const projectile = {
            x: player.x,
            y: player.y,
            vx: input.directionX * velocity,
            vy: input.directionY * velocity,
            rotation: 0,
            ownerId: id,
            hasExitedOwnerHitbox: false
          };
          this.projectiles.push(projectile);
        }
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
        if (this.gameMode === 'teamDeathmatch') {
          this.winner = this.redTeamScore > this.blueTeamScore ? 'red' :
                        this.blueTeamScore > this.redTeamScore ? 'blue' : 'tie';
        }
        return;
      }
    }

    if (this.gameMode === 'goldrush') {
      this.coinSpawnTimer -= dt;
      if (this.coinSpawnTimer <= 0) {
        this.spawnCoin();
        this.coinSpawnTimer = COIN_SPAWN_INTERVAL * 1000;
      }
    }

    const dtSeconds = dt / 1000;

    // Update projectiles
    this.projectiles = this.projectiles.filter((proj) => {
      proj.x += proj.vx * dtSeconds;
      proj.y += proj.vy * dtSeconds;
      proj.vy += GRAVITY * dtSeconds;
      proj.rotation = Math.atan2(proj.vy, proj.vx);

      if (!proj.hasExitedOwnerHitbox && this.players[proj.ownerId]) {
        const owner = this.players[proj.ownerId];
        const dx = owner.x - proj.x;
        const dy = owner.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= PLAYER_RADIUS + PROJECTILE_WIDTH / 2) {
          proj.hasExitedOwnerHitbox = true;
        }
      }

      // Boundary check
      if (proj.x < 0 || proj.x > WIDTH || proj.y > HEIGHT) {
        this.handleImpact(proj);
        return false;
      }

      // Terrain collision
      const floorY = this.getFloorYAt(proj.x);
      const ceilingY = this.getCeilingYAt(proj.x);
      if (proj.y >= floorY || proj.y <= ceilingY) {
        this.handleImpact(proj);
        return false;
      }

      // Player collision
      for (const id in this.players) {
        if (id === proj.ownerId && !proj.hasExitedOwnerHitbox) continue;
        const player = this.players[id];
        if (player.isDying) continue; // Skip dying players for direct hits
        const dx = player.x - proj.x;
        const dy = player.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < PLAYER_RADIUS + PROJECTILE_WIDTH / 2) {
          this.handleImpact(proj);
          return false;
        }
      }

      return true;
    });

    // Update impacts
    this.impacts = this.impacts.filter((impact) => {
      impact.time += dtSeconds;
      return impact.time <= impact.maxTime;
    });

    // Update coins' lifetime (only relevant in Goldrush)
    if (this.gameMode === 'goldrush') {
      this.coins.forEach(coin => {
        coin.lifetime -= dt;
      });
    }

    // Update players
    for (const id in this.players) {
      const player = this.players[id];
      if (player.isDying) {
        player.deathAnimationProgress += dt / player.deathAnimationDuration;
        if (player.deathAnimationProgress >= 1) {
          const blackImpact = {
            x: player.x,
            y: player.y,
            time: 0,
            maxTime: BLAST_DURATION,
            color: 'black'
          };
          this.impacts.push(blackImpact);
          this.respawnPlayer(id);
        }
      } else {
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
            if (input.jump && !player.lastJumpInput && player.canDoubleJump) {
              player.vy = JUMP_VELOCITY;
              player.canDoubleJump = false;
            }
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
            player.canDoubleJump = true;
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
    }

    // Handle coin collection (only in Goldrush)
    if (this.gameMode === 'goldrush') {
      this.coins = this.coins.filter(coin => {
        let keep = true;
        for (const id in this.players) {
          const player = this.players[id];
          if (player.isDying) continue;
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

    // Check win conditions
    if (this.gameMode === 'teamDeathmatch') {
      if (this.redTeamScore >= this.killLimit || this.blueTeamScore >= this.killLimit) {
        this.state = 'gameOver';
        this.winner = this.redTeamScore > this.blueTeamScore ? 'red' :
                      this.blueTeamScore > this.redTeamScore ? 'blue' : 'tie';
        return;
      }
    } else if (this.gameMode === 'deathmatch') {
      for (const id in this.players) {
        if (this.players[id].score >= this.killLimit) {
          this.state = 'gameOver';
          return;
        }
      }
    } else if (this.gameMode === 'goldrush') {
      for (const id in this.players) {
        if (this.players[id].score >= this.goldWinLimit) {
          this.state = 'gameOver';
          return;
        }
      }
    }
  }

  handleImpact(proj) {
    const impact = {
      x: proj.x,
      y: proj.y,
      time: 0,
      maxTime: BLAST_DURATION
    };
    this.impacts.push(impact);

    for (const id in this.players) {
      const player = this.players[id];
      if (player.isDying) continue; // Skip already dying players
      const dx = player.x - proj.x;
      const dy = player.y - proj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < BLAST_RADIUS) {
        // Disengage the rope if it is attached
        if (player.rope.state === 'attached') {
          player.rope.state = 'none';
        }

        const proximity = 1 - (dist / BLAST_RADIUS); // 1 at center, 0 at edge
        const damage = 55 * proximity; // 55% at center, 0% at edge

        const isSameTeam = this.gameMode === 'deathmatch' 
        ? id === proj.ownerId 
        : this.players[proj.ownerId].team === player.team;

        if (!isSameTeam || this.friendlyFire) {
          player.health -= damage;
          if (player.health <= 0) {
            player.isDying = true;
            player.deathAnimationProgress = 0;
            if ((this.gameMode === 'deathmatch' || this.gameMode === 'teamDeathmatch') && 
                proj.ownerId && this.players[proj.ownerId]) {
                  if (!isSameTeam) {
                    if (this.gameMode === 'teamDeathmatch') {
                      const ownerTeam = this.players[proj.ownerId].team;
                      if (ownerTeam === 'red') {
                        this.redTeamScore += 1;
                      } else if (ownerTeam === 'blue') {
                        this.blueTeamScore += 1;
                      }
                      this.players[proj.ownerId].score += 1; // Optional: keep individual score
                    } else {
                      this.players[proj.ownerId].score += 1; // Deathmatch mode
                    }
                  } else if (this.friendlyFire && this.gameMode === 'teamDeathmatch') {
                    const ownerTeam = this.players[proj.ownerId].team;
                    if (ownerTeam === 'red') {
                      this.redTeamScore -= 1;
                    } else if (ownerTeam === 'blue') {
                      this.blueTeamScore -= 1;
                    }
                    this.players[proj.ownerId].score -= 1; // Optional: keep individual score
                  }
                }
              }
            }

        // Apply blast force (unchanged)
        const force = MAX_BLAST_FORCE * proximity;
        const dirX = dx / dist || 0;
        const dirY = dy / dist || 0;
        player.vx += dirX * force;
        player.vy += dirY * force;
        player.onGround = false;
      }
    }
  }

  reset() {
    this.generateTerrain();
    this.state = 'playing';
    this.timer = this.timeLimit === Infinity ? Infinity : this.timeLimit * 1000;
    this.coins = [];
    this.projectiles = [];
    this.impacts = [];
    this.coinSpawnTimer = COIN_SPAWN_INTERVAL * 1000;
    if (this.gameMode === 'teamDeathmatch') {
      this.redTeamScore = 0;
      this.blueTeamScore = 0;
    }
    for (const id in this.players) {
      const player = this.players[id];
      player.x = WIDTH / 4;
      player.y = this.getFloorYAt(WIDTH / 4) - PLAYER_RADIUS;
      player.vx = 0;
      player.vy = 0;
      player.score = 0;
      player.rotation = 0;
      player.rope = {
        state: 'none',
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
        length: 0,
        dx: 0,
        dy: 0
      };
      player.chatMessages = [];
      player.nextMessageId = 0;
      player.onGround = false;
      player.lastRopeInput = false;
      player.lastJumpInput = false;
      player.canDoubleJump = false;
      player.isDying = false;
      player.deathAnimationProgress = 0;
    }
    if (this.gameMode === 'goldrush') {
      this.spawnCoin();
    }
  }

  getState() {
    return {
      roomId: this.roomId,
      players: Object.values(this.players).map(player => ({
        ...player,
        isDying: player.isDying,
        deathAnimationProgress: player.deathAnimationProgress,
        health: player.health
      })),
      coins: this.coins,
      chatHistory: this.chatHistory,
      state: this.state,
      winner: this.winner,
      timer: this.timer,
      duration: this.timeLimit,
      terrain: {
        x: this.x,
        yFloor: this.yFloor,
        yCeiling: this.yCeiling
      },
      projectiles: this.projectiles,
      impacts: this.impacts.map(impact => ({
        ...impact
      })),
      gameMode: this.gameMode,
      redTeamScore: this.redTeamScore,
      blueTeamScore: this.blueTeamScore
    };
  }
}

module.exports = Game;