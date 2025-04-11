import React, { useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
import ChatBox from "./ChatBox";
import { useParams } from "react-router-dom";

const Host = () => {
  const videoRef = useRef();
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const [peers, setPeers] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [mutedUsers, setMutedUsers] = useState([]);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const { streamId: hostId } = useParams();
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" }, // Public STUN server
    {
      urls: "turn:openrelay.metered.ca:80", // Public TURN server
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  const connectWebSocket = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN)
      return;
    socketRef.current = new WebSocket("ws://192.168.1.89:8880");
    const socket = socketRef.current;

    socket.onopen = () => {
      console.log("WebSocket connected");
      setSocketStatus("connected");
      socket.send(
        JSON.stringify({
          type: "register",
          payload: { userId: hostId, role: "host" },
        })
      );
    };

    socket.onmessage = ({ data }) => {
      const msg = JSON.parse(data);
      console.log("signl");
      console.log("Received signal from:", data);
      if (msg.type === "signal") {
        const fromId = msg.payload.from;
        if (!peersRef.current[fromId]) {
          const stream = videoRef.current?.srcObject;
          if (!stream) {
            console.error("Stream not available yet for peer creation");
            return;
          }
          const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
            config: { iceServers },
          });
          peer.on("signal", (signal) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  type: "signal",
                  payload: { to: fromId, from: hostId, signal },
                })
              );
            }
          });
          peer.on("error", (err) => console.error("Peer error:", err));
          peer.on("close", () => {
            console.log(`Peer ${fromId} closed`);
            delete peersRef.current[fromId];
            setPeers((prev) => {
              const newPeers = { ...prev };
              delete newPeers[fromId];
              return newPeers;
            });
          });
          peersRef.current[fromId] = peer;
          setPeers((prev) => ({ ...prev, [fromId]: peer }));
        }
        if (peersRef.current[fromId])
          peersRef.current[fromId].signal(msg.payload.signal);
      }
      if (msg.type === "chat") {
        console.log("Chat message:", msg.payload);
        setChatMessages((prev) => [...prev, msg.payload]);
      }
    };

    socket.onerror = (err) => {
      console.error("WebSocket error:", err);
      setSocketStatus("error");
    };
    socket.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      setSocketStatus("disconnected");
      setTimeout(connectWebSocket, 1000);
    };
  };

  useEffect(() => {
    const setupHost = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        videoRef.current.srcObject = stream;
        connectWebSocket();
      } catch (err) {
        console.error("Host setup error:", err);
      }
    };
    setupHost();
    return () => {
      console.log("Cleaning up Host...");
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN)
        socketRef.current.close();
      Object.values(peersRef.current).forEach((peer) => {
        if (!peer.destroyed) peer.destroy();
      });
      peersRef.current = {};
    };
  }, []);

  const sendMessage = (text) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ type: "chat", payload: { from: hostId, text } })
      );
    }
  };

  const muteUser = (id) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "mute", payload: { userId: id } }));
      setMutedUsers((prev) => [...prev, id]);
    }
  };

  const unMuteUser = (id) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "unmute", payload: { userId: id } }));
      setMutedUsers((prev) => prev.filter((userId) => userId !== id));
    }
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
      <div
        style={{
          flex: 2,
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
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
            color: socketStatus === "connected" ? "#00ff00" : "#ff4444",
          }}
        >
          WebSocket Status: {socketStatus}
        </div>
      </div>
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
        <div
          style={{
            background: "#2a2a2a",
            padding: "15px",
            borderRadius: "8px",
            maxHeight: "30vh",
            overflowY: "auto",
          }}
        >
          <h3
            style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#00ccff" }}
          >
            Connected Peers
          </h3>
          {Object.keys(peers).map((id) => (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px",
                background: mutedUsers.includes(id) ? "#ff4444" : "#333",
                borderRadius: "5px",
                marginBottom: "10px",
              }}
            >
              <span style={{ fontSize: "14px" }}>User {id}</span>
              <button
                onClick={() => {
                  if(mutedUsers.includes(id))unMuteUser(id);
                  else muteUser(id)
                }}
                style={{
                  padding: "5px 10px",
                  background: mutedUsers.includes(id) ? "#ff6666" : "#00ccff",
                  border: "none",
                  borderRadius: "5px",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "background 0.3s",
                }}
                onMouseOver={(e) =>
                  (e.target.style.background = mutedUsers.includes(id)
                    ? "#ff8888"
                    : "#00e6ff")
                }
                onMouseOut={(e) =>
                  (e.target.style.background = mutedUsers.includes(id)
                    ? "#ff6666"
                    : "#00ccff")
                }
              >
                {mutedUsers.includes(id) ? "Muted" : "Mute"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Host;
