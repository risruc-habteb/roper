const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const Game = require('./game.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {};

// Create the persistent lobby room
const lobbyRoomId = 'lobby';
rooms[lobbyRoomId] = {
  game: new Game(lobbyRoomId, Infinity), // No time limit
  players: [],
  name: 'Lobby',
  host: null // No specific host, as it’s persistent
};

io.on('connection', (socket) => {
  socket.nickname = null; // Nickname is optional, null by default
  let currentRoom = '';

  console.log('A player connected:', socket.id);

  // Send room list to the newly connected client
  sendRoomList(socket);

  // Handle optional nickname setting
  socket.on('setNickname', (name) => {
    if (name.trim()) {
      socket.nickname = name.trim();
      console.log(`Nickname set for ${socket.id}: ${socket.nickname}`);
    }
  });

  // Create a room, using nickname or socket ID as display name
  socket.on('createRoom', () => {
    const displayName = socket.nickname || socket.id;
    const roomId = Math.random().toString(36).substring(7);
    const roomName = `${displayName}'s Room`;
    rooms[roomId] = {
      game: new Game(roomId, 60), // Default to 60s
      players: [{ id: socket.id, displayName }],
      name: roomName,
      host: socket.id // The creator is the host
    };
    socket.join(roomId);
    currentRoom = roomId;
    rooms[roomId].game.addPlayer(socket.id, displayName);
    console.log(`${displayName} created and joined room ${roomId} named "${roomName}"`);
    socket.emit('roomJoined', { roomId, isHost: true });
    broadcastRoomList();
  });

  // Join a room, using nickname or socket ID
  socket.on('joinRoom', ({ roomId }) => {
    if (rooms[roomId] && (rooms[roomId].players.length < 10 || roomId === lobbyRoomId)) {
      const displayName = socket.nickname || socket.id;
      socket.join(roomId);
      currentRoom = roomId;
      rooms[roomId].players.push({ id: socket.id, displayName });
      rooms[roomId].game.addPlayer(socket.id, displayName);
      io.to(roomId).emit('playerJoined', displayName);
      console.log(`${displayName} joined room ${roomId}`);
      socket.emit('roomJoined', { roomId, isHost: rooms[roomId].host === socket.id });
      broadcastRoomList();
    } else {
      socket.emit('error', 'Room full or invalid');
    }
  });

  // Handle player input
  socket.on('input', (input) => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].game.handleInput(socket.id, input);
    }
  });

  // Reset game, only allowed by the host
  socket.on('resetGame', () => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].host === socket.id) {
      rooms[currentRoom].game.reset();
      console.log(`Game reset in room ${currentRoom} by host ${socket.id}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      const displayName = socket.nickname || socket.id;
      io.to(currentRoom).emit('playerLeft', displayName);
      rooms[currentRoom].game.removePlayer(socket.id);
      rooms[currentRoom].players = rooms[currentRoom].players.filter(p => p.id !== socket.id);
      if (rooms[currentRoom].players.length === 0 && currentRoom !== lobbyRoomId) {
        delete rooms[currentRoom];
        console.log(`Room ${currentRoom} deleted due to all players disconnecting`);
      }
      console.log(`${displayName} disconnected from room ${currentRoom}`);
      broadcastRoomList();
    }
  });

  socket.on('getRooms', () => {
    sendRoomList(socket);
  });
});

// Broadcast available rooms to all clients
function broadcastRoomList() {
  const availableRooms = Object.entries(rooms)
    .filter(([roomId, room]) => room.players.length < 10 || roomId === lobbyRoomId)
    .map(([roomId, room]) => ({ id: roomId, name: room.name }));
  console.log('Broadcasting room list:', availableRooms);
  io.emit('roomList', availableRooms);
}

// Send room list to a specific socket
function sendRoomList(socket) {
  const availableRooms = Object.entries(rooms)
    .filter(([roomId, room]) => room.players.length < 10 || roomId === lobbyRoomId)
    .map(([roomId, room]) => ({ id: roomId, name: room.name }));
  console.log(`Sending room list to ${socket.id}:`, availableRooms);
  socket.emit('roomList', availableRooms);
}

// Game loop for all rooms (60 FPS)
setInterval(() => {
  for (const roomId in rooms) {
    const { game } = rooms[roomId];
    game.update(1000 / 60);
    io.to(roomId).emit('gameState', game.getState());
  }
}, 1000 / 60);

server.listen(3000, () => {
  console.log('Server running on port 3000');
});