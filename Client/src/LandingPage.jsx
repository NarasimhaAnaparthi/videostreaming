import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";

const hostId = uuidv4();

const LandingPage = () => {
  const [streamId, setStreamId] = useState("");
  const navigate = useNavigate();

  const handleHostStream = () => {
    navigate(`/host/${hostId}`); // Navigate to Host page
  };

  const handleJoinStream = () => {
    if (streamId.trim()) {
      navigate(`/view/${streamId}`); // Navigate to Viewer page with stream ID
    } else {
      alert("Please enter a stream ID to join!");
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)",
        color: "#fff",
        fontFamily: "'Arial', sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: "36px",
          marginBottom: "40px",
          color: "#00ccff",
          textShadow: "0 2px 10px rgba(0, 204, 255, 0.5)",
        }}
      >
        WebRTC Streaming
      </h1>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          width: "300px",
          background: "#2a2a2a",
          padding: "30px",
          borderRadius: "10px",
          boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
        }}
      >
        <button
          onClick={handleHostStream}
          style={{
            padding: "12px 20px",
            background: "#00ccff",
            border: "none",
            borderRadius: "5px",
            color: "#fff",
            fontSize: "16px",
            cursor: "pointer",
            transition: "background 0.3s, transform 0.2s",
          }}
          onMouseOver={(e) => {
            e.target.style.background = "#00e6ff";
            e.target.style.transform = "scale(1.05)";
          }}
          onMouseOut={(e) => {
            e.target.style.background = "#00ccff";
            e.target.style.transform = "scale(1)";
          }}
        >
          Host Stream
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <input
            type="text"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            placeholder="Enter Stream ID"
            style={{
              padding: "10px",
              borderRadius: "5px",
              border: "1px solid #00ccff",
              background: "#333",
              color: "#fff",
              outline: "none",
              fontSize: "14px",
              transition: "border-color 0.3s",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#00e6ff")}
            onBlur={(e) => (e.target.style.borderColor = "#00ccff")}
          />
          <button
            onClick={handleJoinStream}
            style={{
              padding: "12px 20px",
              background: "#00ccff",
              border: "none",
              borderRadius: "5px",
              color: "#fff",
              fontSize: "16px",
              cursor: "pointer",
              transition: "background 0.3s, transform 0.2s",
            }}
            onMouseOver={(e) => {
              e.target.style.background = "#00e6ff";
              e.target.style.transform = "scale(1.05)";
            }}
            onMouseOut={(e) => {
              e.target.style.background = "#00ccff";
              e.target.style.transform = "scale(1)";
            }}
          >
            Join Stream
          </button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
