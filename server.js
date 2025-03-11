// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const Game = require('./game.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const games = {};

app.use(express.static(__dirname)); // Serve static files (e.g., index.html)

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('setNickname', (nickname) => {
    socket.nickname = nickname || `Player${socket.id.slice(0, 4)}`;
  });

  socket.on('createRoom', ({ duration }) => {
    const roomId = `room${Math.floor(Math.random() * 10000)}`;
    games[roomId] = new Game(roomId, duration);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('roomJoined', { roomId, isHost: true });
    games[roomId].addPlayer(socket.id, socket.nickname || `Player${socket.id.slice(0, 4)}`);
  });

  socket.on('joinRoom', ({ roomId }) => {
    if (games[roomId]) {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.emit('roomJoined', { roomId, isHost: false });
      games[roomId].addPlayer(socket.id, socket.nickname || `Player${socket.id.slice(0, 4)}`);
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  socket.on('input', (input) => {
    if (socket.roomId && games[socket.roomId]) {
      games[socket.roomId].handleInput(socket.id, input);
    }
  });

  socket.on('resetGame', () => {
    if (socket.roomId && games[socket.roomId]) {
      games[socket.roomId].reset();
    }
  });

  socket.on('disconnect', () => {
    if (socket.roomId && games[socket.roomId]) {
      games[socket.roomId].removePlayer(socket.id);
      if (Object.keys(games[socket.roomId].players).length === 0) {
        delete games[socket.roomId];
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

setInterval(() => {
  for (const roomId in games) {
    const game = games[roomId];
    game.update(1000 / 60); // 60 FPS
    io.to(roomId).emit('gameState', game.getState());
  }
}, 1000 / 60);

server.listen(3000, () => {
  console.log('Server running on port 3000');
});