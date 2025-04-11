import React, { useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
import ChatBox from "./ChatBox";
import { v4 as uuidv4 } from "uuid";
import { useParams } from "react-router-dom";

const viewerId = uuidv4();

const Viewer = () => {
  const videoRef = useRef();
  const socketRef = useRef(new WebSocket("wss://videostreaming-zkt4.onrender.com"));
  const peerRef = useRef(null);
  const { streamId } = useParams();
  const [chatMessages, setChatMessages] = useState([]);
  const [streamActive, setStreamActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false); // Fullscreen state
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" }, // Public STUN server
    {
      urls: "turn:openrelay.metered.ca:80", // Public TURN server
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];
  useEffect(() => {
    const socket = socketRef.current;
    peerRef.current = new Peer({
      initiator: true,
      trickle: false,
      config: { iceServers },
    });

    const setupViewer = () => {
      socket.onopen = () => {
        console.log("Viewer WebSocket connected");
        socket.send(
          JSON.stringify({
            type: "register",
            payload: { userId: viewerId, role: "viewer" },
          })
        );
      };

      peerRef.current.on("signal", (signal) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "signal",
              payload: { to: streamId, from: viewerId, signal },
            })
          );
        } else {
          console.error("WebSocket not open, cannot send signal");
        }
      });

      peerRef.current.on("stream", (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
        } else {
          console.error("Video ref not available");
        }
      });

      peerRef.current.on("error", (err) => console.error("Peer error:", err));

      socket.onmessage = ({ data }) => {
        const msg = JSON.parse(data);
        if (msg.type === "signal" && msg.payload.to === viewerId) {
          peerRef.current.signal(msg.payload.signal);
        }
        if (msg.type === "chat") {
          setChatMessages((prev) => [...prev, msg.payload]);
        }
      };

      socket.onerror = (err) => console.error("WebSocket error:", err);
      socket.onclose = () => console.log("WebSocket closed");
    };

    setupViewer();

    return () => {
      console.log("Cleaning up Viewer...");
      if (socket.readyState === WebSocket.OPEN) socket.close();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const sendMessage = (text) => {
    const socket = socketRef.current;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ type: "chat", payload: { from: viewerId, text } })
      );
    } else {
      console.error("Cannot send message: WebSocket is not open");
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      videoRef.current.requestFullscreen().catch((err) => {
        console.error("Fullscreen error:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("Exit fullscreen error:", err);
      });
    }
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#1a1a1a",
        color: "#fff",
        fontFamily: "'Arial', sans-serif",
      }}
    >
      {/* Video Section */}
      <div
        style={{
          flex: 2,
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          position: "relative",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={true}
          style={{
            width: "100%",
            maxHeight: "60vh",
            borderRadius: "10px",
            boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
            objectFit: "cover",
            background: "#000",
          }}
        />
        <div
          style={{
            background: "#2a2a2a",
            padding: "10px",
            borderRadius: "8px",
            textAlign: "center",
            fontSize: "14px",
            color: streamActive ? "#00ff00" : "#ff4444",
          }}
        >
          Stream Status: {streamActive ? "Live" : "Offline"}
        </div>
        <button
          onClick={toggleFullscreen}
          style={{
            position: "absolute",
            bottom: "50px",
            right: "30px",
            padding: "8px 15px",
            background: "#00ccff",
            border: "none",
            borderRadius: "5px",
            color: "#fff",
            cursor: "pointer",
            transition: "background 0.3s",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
          }}
          onMouseOver={(e) => (e.target.style.background = "#00e6ff")}
          onMouseOut={(e) => (e.target.style.background = "#00ccff")}
        >
          {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        </button>
      </div>

      {/* Chat Section */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "20px",
          gap: "20px",
        }}
      >
        <ChatBox messages={chatMessages} sendMessage={sendMessage} />
      </div>
    </div>
  );
};

export default Viewer;
