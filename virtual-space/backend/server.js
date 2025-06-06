// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173", // Your frontend URL
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// Store room data (users, files, messages, video state)
const rooms = {};

// Handle Socket.IO connections
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join room
  socket.on("join-room", (roomId, userName) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        fileType: null,
        fileSource: null,
        isPlaying: false,
        currentTime: 0,
        messages: [],
      };
    }

    // Assign unique name
    let finalName = userName && userName.trim() ? userName.trim() : "Author";
    let counter = 1;
    let baseName = finalName;
    while (rooms[roomId].users.some((u) => u.name === finalName)) {
      finalName = `${baseName}${counter}`;
      counter++;
    }

    const user = { id: socket.id, name: finalName };
    rooms[roomId].users.push(user);

    socket.emit("initial-state", rooms[roomId]);
    io.to(roomId).emit("user-joined", rooms[roomId].users);
  });

  // File change
  socket.on("file-change", (roomId, fileType, fileSource) => {
    if (rooms[roomId]) {
      rooms[roomId].fileType = fileType;
      rooms[roomId].fileSource = fileSource;
      io.to(roomId).emit("sync-file-change", fileType, fileSource);
    }
  });

  // Video play
  socket.on("play-video", (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].isPlaying = true;
      socket.to(roomId).emit("sync-play");
    }
  });

  // Video pause
  socket.on("pause-video", (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].isPlaying = false;
      socket.to(roomId).emit("sync-pause");
    }
  });

  // Video seek
  socket.on("seek-video", (roomId, time) => {
    if (rooms[roomId]) {
      rooms[roomId].currentTime = time;
      socket.to(roomId).emit("sync-seek", time);
    }
  });

  // Chat message
  socket.on("send_message", (messageData) => {
    if (rooms[messageData.room]) {
      rooms[messageData.room].messages.push(messageData);
      io.to(messageData.room).emit("receive_message", messageData);
    }
  });

  // WebRTC signaling for video call
  socket.on("offer", ({ to, offer }) => {
    socket.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    socket.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    socket.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.users = room.users.filter((user) => user.id !== socket.id);
      if (room.users.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit("user-joined", room.users);
      }
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Start server
server.listen(5000, () => {
  console.log("Server running on port 5000");
});