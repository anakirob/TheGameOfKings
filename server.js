// --- SERVER.JS ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log('A Lord entered the realm:', socket.id);

    // [1] TAVERN CHAT
    socket.on('lobbyChat', (data) => {
        data.socketId = socket.id;
        io.emit('lobbyChat', data);
    });

    // [2] DIRECT DUELS
    socket.on('challengePlayer', (data) => {
        io.to(data.targetId).emit('incomingChallenge', { challengerId: socket.id, challengerName: data.challengerName });
    });

    // [3] ACCEPT DUEL
    socket.on('acceptChallenge', (challengerId) => {
        const roomName = `duel-${Date.now()}`;
        socket.join(roomName);

        const challengerSocket = io.sockets.sockets.get(challengerId);
        if (challengerSocket) {
            challengerSocket.join(roomName); socket.room = roomName; challengerSocket.room = roomName;
            io.to(roomName).emit('matchFound', { room: roomName });
            socket.emit('assignColor', 'black'); challengerSocket.emit('assignColor', 'white');
        }
    });

    // [4] DECLINE DUEL
    socket.on('declineChallenge', (challengerId) => { io.to(challengerId).emit('challengeDeclined'); });

    // [5] RANDOM QUEUE
    socket.on('findMatch', () => {
        if (waitingPlayer && waitingPlayer !== socket) {
            const roomName = `room-${socket.id}`;
            socket.join(roomName); waitingPlayer.join(roomName);
            io.to(roomName).emit('matchFound', { room: roomName });
            socket.emit('assignColor', 'black'); waitingPlayer.emit('assignColor', 'white');
            socket.room = roomName; waitingPlayer.room = roomName; waitingPlayer = null;
        } else {
            waitingPlayer = socket; socket.emit('waitingForOpponent');
        }
    });

    // [6] GAME ENGINE
    socket.on('sendGameState', (gameState) => { socket.to(socket.room).emit('receiveGameState', gameState); });

    // [7] CLEANUP
    socket.on('disconnect', () => {
        console.log('A Lord departed:', socket.id);
        if (waitingPlayer === socket) waitingPlayer = null;
        if (socket.room) socket.to(socket.room).emit('opponentDisconnected');
    });

        // [8] THEME SYNC: Share color sliders across the room
        socket.on('syncTheme', (themeData) => {
            socket.to(socket.room).emit('receiveTheme', themeData);
        });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`The Realm is open on http://localhost:${PORT}`); });
