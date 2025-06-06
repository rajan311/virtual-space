// 1. Import React hooks, router utilities, Socket.IO, and Axios
import { useEffect, useRef, useState } from "react"; // Hooks for state and lifecycle
import { useParams, useLocation } from "react-router-dom"; // Router for URL params and state
import { io } from "socket.io-client"; // Real-time communication
import axios from "axios"; // HTTP requests
import './Movie.css'; // Styling

// 2. Initialize Socket.IO client
const socket = io("http://localhost:5000");

// 3. Room component for virtual movie theater
export default function Room() {
  // 4. Get roomId and userName from URL and navigation state
  const { roomId } = useParams(); // Room ID from URL
  const { state } = useLocation(); // Navigation state
  const userName = state?.name || ""; // User's name or empty string

  // 5. State and refs for UI, video player, and WebRTC
  const videoRef = useRef(null); // Ref for media player
  const isRemoteAction = useRef(false); // Tracks remote video player actions
  const localVideoRef = useRef(null); // Ref for local video stream
  const remoteVideoRef = useRef(null); // Ref for remote video stream
  const peerConnectionRef = useRef(null); // WebRTC peer connection
  const [fileData, setFileData] = useState(null); // Uploaded file data
  const [isPlaying, setIsPlaying] = useState(false); // Media play state
  const [currentTime, setCurrentTime] = useState(0); // Media current time
  const [users, setUsers] = useState([]); // Room users
  const [isHost, setIsHost] = useState(false); // Host status
  const [showChat, setShowChat] = useState(false); // Toggle chat UI
  const [messageList, setMessageList] = useState([]); // Chat messages
  const [currentMessage, setCurrentMessage] = useState(""); // Chat input
  const [showVideoCall, setShowVideoCall] = useState(false); // Toggle video call UI

  // 6. Effect to handle Socket.IO events and WebRTC signaling
  useEffect(() => {
    // 7. Join room
    socket.emit("join-room", roomId, userName);

    // 8. Initialize room state
    socket.on("initial-state", (roomState) => {
      if (roomState.fileSource) {
        setFileData({ type: roomState.fileType, url: roomState.fileSource });
      }
      setIsPlaying(roomState.isPlaying || false);
      setCurrentTime(roomState.currentTime || 0);
      setUsers(roomState.users || []);
      setIsHost(roomState.users && roomState.users[0]?.id === socket.id);
      setMessageList(roomState.messages || []);
    });

    // 9. Update users
    socket.on("user-joined", (updatedUsers) => {
      setUsers(updatedUsers);
      setIsHost(updatedUsers[0]?.id === socket.id);
    });

    // 10. Sync file changes
    socket.on("sync-file-change", (fileType, url) => {
      setFileData({ type: fileType, url });
    });

    // 11. Sync media play
    socket.on("sync-play", () => {
      if (videoRef.current) {
        isRemoteAction.current = true;
        videoRef.current.play().finally(() => {
          isRemoteAction.current = false;
        });
      }
    });

    // 12. Sync media pause
    socket.on("sync-pause", () => {
      if (videoRef.current) {
        isRemoteAction.current = true;
        videoRef.current.pause();
        setTimeout(() => {
          isRemoteAction.current = false;
        }, 200);
      }
    });

    // 13. Sync media seek
    socket.on("sync-seek", (time) => {
      if (videoRef.current) {
        isRemoteAction.current = true;
        videoRef.current.currentTime = time;
        setTimeout(() => {
          isRemoteAction.current = false;
        }, 200);
      }
    });

    // 14. Receive chat messages
    socket.on("receive_message", (data) => {
      setMessageList((list) => {
        if (!list.some((msg) => msg.time === data.time && msg.author === data.author && msg.message === data.message)) {
          return [...list, data];
        }
        return list;
      });
    });

    // 15. WebRTC signaling: Receive offer
    socket.on("offer", async (offer, fromUserId) => {
      if (!peerConnectionRef.current) {
        initializePeerConnection();
      }
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit("answer", answer, roomId, fromUserId);
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    });

    // 16. Receive answer
    socket.on("answer", async (answer) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
          console.error("Error handling answer:", error);
        }
      }
    });

    // 17. Receive ICE candidate
    socket.on("ice-candidate", async (candidate) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error("Error handling ICE candidate:", error);
        }
      }
    });

    // 18. Cleanup Socket.IO listeners
    return () => {
      socket.off("initial-state");
      socket.off("sync-file-change");
      socket.off("sync-play");
      socket.off("sync-pause");
      socket.off("sync-seek");
      socket.off("user-joined");
      socket.off("receive_message");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
    };
  }, [roomId]);

  // 19. Initialize WebRTC peer connection
  const initializePeerConnection = () => {
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }], // Free STUN server
    });

    // 20. Add local stream to peer connection
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, localVideoRef.current.srcObject);
      });
    }

    // 21. Handle remote stream
    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // 22. Handle ICE candidates
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate, roomId);
      }
    };
  };

  // 23. Start video call
  const startVideoCall = async () => {
    if (showVideoCall) {
      // Stop video call
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject.getTracks().forEach((track) => track.stop());
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      setShowVideoCall(false);
      return;
    }

    try {
      // 24. Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // 25. Initialize peer connection
      initializePeerConnection();

      // 26. Create and send offer
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socket.emit("offer", offer, roomId, socket.id);

      setShowVideoCall(true);
    } catch (error) {
      console.error("Error starting video call:", error);
      alert("Failed to start video call. Please check camera/mic permissions.");
    }
  };

  // 27. Handle media play
  const handlePlay = () => {
    if (!isRemoteAction.current) {
      socket.emit("play-video", roomId);
      setIsPlaying(true);
    }
  };

  // 28. Handle media pause
  const handlePause = () => {
    if (!isRemoteAction.current) {
      socket.emit("pause-video", roomId);
      setIsPlaying(false);
    }
  };

  // 29. Handle media seek
  const handleSeek = (e) => {
    const time = e.target.currentTime;
    if (!isRemoteAction.current && Math.abs(time - currentTime) > 10) {
      setCurrentTime(time);
      socket.emit("seek-video", roomId, time);
    }
  };

  // 30. Handle file upload (host only)
  const handleFileUpload = (event) => {
    if (!isHost) return;
    const file = event.target.files[0];
    if (!file) return;

    const fileURL = URL.createObjectURL(file);

    if (file.type.startsWith("video/")) {
      setFileData({ type: "video", url: fileURL });
      socket.emit("file-change", roomId, "video", fileURL);
    } else if (file.type.startsWith("image/")) {
      setFileData({ type: "image", url: fileURL });
      socket.emit("file-change", roomId, "image", fileURL);
    } else if (file.type === "application/pdf") {
      setFileData({ type: "pdf", url: fileURL });
      socket.emit("file-change", roomId, "pdf", fileURL);
    } else if (file.type.startsWith("text/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFileData({ type: "text", content: e.target.result });
        socket.emit("file-change", roomId, "text", e.target.result);
      };
      reader.readAsText(file);
    } else {
      alert("Unsupported file type. Only videos, images, PDFs, and text files are allowed.");
    }
  };

  // 31. Open folder (placeholder)
  const openFolder = () => {
    axios
      .post("http://localhost:5000/open-folder", { folderPath: "C:\\Users\\YourUsername\\Videos" })
      .then(() => console.log("✅ Folder opened successfully"))
      .catch((error) => console.error("❌ Error opening folder:", error));
  };

  // 32. Send chat message
  const sendMessage = async () => {
    if (currentMessage.trim() !== "") {
      const messageData = {
        room: roomId,
        author: userName || "Author",
        message: currentMessage,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      await socket.emit("send_message", messageData);
      setCurrentMessage("");
    }
  };

  // 33. Render UI
  return (
    <div style={{ textAlign: "center", marginTop: "50px", border: "2px solid black", padding: "20px" }}>
      {/* 34. Room info */}
      <h1>Room ID: {roomId}</h1>
      <p>Users in Room: {users.length}</p>

      {/* 35. File upload for host */}
      {isHost && (
        <div style={{ margin: "10px 0" }}>
          <input type="file" onChange={handleFileUpload} />
        </div>
      )}

      {/* 36. File display and buttons */}
      {fileData ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          {/* 37. File display */}
          <div style={{ width: "70%", marginRight: "20px" }}>
            {fileData.type === "video" && (
              <video
                ref={videoRef}
                width="600"
                controls
                onPlay={handlePlay}
                onPause={handlePause}
                onTimeUpdate={handleSeek}
              >
                <source src={fileData.url} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            )}
            {fileData.type === "image" && (
              <img src={fileData.url} alt="Uploaded" style={{ maxWidth: "400px" }} />
            )}
            {fileData.type === "pdf" && (
              <iframe src={fileData.url} width="600" height="500" title="PDF Viewer" />
            )}
            {fileData.type === "text" && (
              <pre style={{ border: "1px solid #ccc", padding: "10px", whiteSpace: "pre-wrap" }}>
                {fileData.content}
              </pre>
            )}
          </div>

          {/* 38. Buttons */}
          <div style={{ width: "30%", border: "2px solid red", padding: "10px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <button onClick={() => setShowChat(true)} style={{ padding: "10px" }}>Chat</button>
            <button onClick={startVideoCall} style={{ padding: "10px" }}>
              {showVideoCall ? "End Video Call" : "Video Call"}
            </button>
            
          </div>
        </div>
      ) : (
        <p>Waiting for host to upload a file...</p>
      )}

      {/* 39. Chat UI */}
      {showChat && (
        <div style={{ width: "60%", margin: "20px auto", border: "1px solid gray", padding: "10px" }}>
          <h3>Live Chat</h3>
          <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #ddd", padding: "10px", marginBottom: "10px" }}>
            {messageList.map((msg, idx) => (
              <div
                key={`${msg.author}-${msg.time}-${idx}`}
                style={{ textAlign: msg.author === userName ? "right" : "left" }}
              >
                <p>
                  <strong>{msg.author === userName ? "You" : msg.author}</strong>: {msg.message}
                </p>
                <small>{msg.time}</small>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              type="text"
              placeholder="Type a message..."
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              style={{ flex: 1, padding: "8px" }}
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      )}

      {/* 40. Video call UI */}
      {showVideoCall && (
        <div style={{ width: "60%", margin: "20px auto", border: "1px solid gray", padding: "10px" }}>
          <h3>Video Call</h3>
          <div style={{ display: "flex", gap: "20px", justifyContent: "center" }}>
            <div>
              <h4>Your Video</h4>
              <video ref={localVideoRef} autoPlay muted style={{ width: "300px" }} />
            </div>
            <div>
              <h4>Remote Video</h4>
              <video ref={remoteVideoRef} autoPlay style={{ width: "300px" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}