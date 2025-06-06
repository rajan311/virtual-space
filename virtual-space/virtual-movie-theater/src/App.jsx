import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { v4 as uuidV4 } from "uuid";
import './App.css';

export default function App() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  const [name, setName] = useState(""); // State for name input

  const createRoom = () => {
    if (!name.trim()) {
      alert("Please enter your name!");
      return;
    }
    const newRoomId = uuidV4(); // Generate Unique Room ID
    navigate(`/room/${newRoomId}`, { state: { name } }); // Pass name
  };

  const joinRoom = () => {
    if (!name.trim()) {
      alert("Please enter your name!");
      return;
    }
    if (roomId.trim() !== "") {
      navigate(`/room/${roomId}`, { state: { name } });
    } else {
      alert("Enter a valid Room ID!");
    }
  };

  return (
    <div className="hello">
      <div className="container">
        <h1>Welcome to Virtual screen</h1>
        <input
          className="input"
          type="text"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginBottom: "10px" }} // Optional styling
        />
        <br />
        <button className="button" onClick={createRoom}>
          Host a Room
        </button>
        <br />
        <input
          className="input"
          type="text"
          placeholder="Enter Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
        <button className="button" onClick={joinRoom}>
          Join a Room
        </button>
      </div>
    </div>
  );
}