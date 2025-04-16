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
  const [qaRequests, setQaRequests] = useState([]);
  const [activeQaUsers, setActiveQaUsers] = useState([]);
  const { streamId: hostId } = useParams();
  const SOCKETAPI =
    "wss://videostreaming-zkt4.onrender.com" ;
    const iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turns:openrelay.metered.ca:443" // Secure TURN
        ],
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:relay1.experiment.webrtc.org:3478",
        username: "openrelayproject",
        credential: "tesopenrelayprojectt",
      }
    ];

  const connectWebSocket = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      setSocketStatus("connected");
      return;
    }
    socketRef.current = new WebSocket(SOCKETAPI);
    const socket = socketRef.current;

    socket.onopen = () => {
      setSocketStatus("connected");
      socket.send(
        JSON.stringify({
          type: "register",
          payload: { userId: hostId, role: "host", streamId: hostId },
        })
      );
    };

    socket.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "signal") {
          const fromId = msg.payload.from;
          if (!peersRef.current[fromId]) {
            const stream = videoRef.current?.srcObject;
            if (!stream) return;
            const peer = new Peer({
              initiator: false,
              trickle: true,
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

            peer.on("stream", (viewerStream) => {
              setPeers((prev) => ({
                ...prev,
                [fromId]: { peer, stream: viewerStream },
              }));
            });

            peer.on("error", (err) =>
              console.error("Peer error for", fromId, ":", err)
            );

            peer.on("close", () => {
              delete peersRef.current[fromId];
              setPeers((prev) => {
                const newPeers = { ...prev };
                delete newPeers[fromId];
                return newPeers;
              });
              setQaRequests((prev) => prev.filter((id) => id !== fromId));
              setActiveQaUsers((prev) => prev.filter((id) => id !== fromId));
            });

            peersRef.current[fromId] = peer;
            setPeers((prev) => ({
              ...prev,
              [fromId]: { peer, stream: null },
            }));
          }
          if (peersRef.current[fromId]) {
            peersRef.current[fromId].signal(msg.payload.signal);
          }
        } else if (msg.type === "request") {
          setQaRequests((prev) => [...prev, msg.payload.from]);
        } else if (msg.type === "chat") {
          setChatMessages((prev) => [...prev, msg.payload]);
        }
      } catch (err) {
        console.error("Host message parse error:", err);
      }
    };

    socket.onerror = () => setSocketStatus("error");

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 2000;

    socket.onclose = (event) => {
      setSocketStatus("disconnected");
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
        setTimeout(connectWebSocket, delay);
        reconnectAttempts++;
      } else {
        setSocketStatus("failed");
      }
    };
  };

  useEffect(() => {
    const setupHost = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current
            .play()
            .catch((err) => console.error("Host video play error:", err));
        }
        connectWebSocket();
      } catch (err) {
        console.error("Host setup error:", err);
      }
    };
    setupHost();
    return () => {
      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        socketRef.current.close();
      }
      Object.values(peersRef.current).forEach((peer) => {
        if (!peer.destroyed) peer.destroy();
      });
      peersRef.current = {};
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [hostId]);

  // Reassign stream on re-render
  useEffect(() => {
    if (videoRef.current && !videoRef.current.srcObject) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          videoRef.current.srcObject = stream;
          videoRef.current
            .play()
            .catch((err) => console.error("Host video play error:", err));
        })
        .catch((err) => console.error("Host stream reassignment error:", err));
    }
  }, [activeQaUsers, peers]);

  const sendMessage = (text) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "chat",
          payload: { from: hostId, text, to: null },
        })
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

  const approveQA = (id) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ type: "approve", payload: { to: id, from: hostId } })
      );
      socket.send(
        JSON.stringify({
          type: "qa_stream",
          payload: { from: id, to: null },
        })
      );
      setActiveQaUsers((prev) => [...prev, id]);
      setQaRequests((prev) => prev.filter((reqId) => reqId !== id));
    }
  };

  const denyQA = (id) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ type: "deny", payload: { to: id, from: hostId } })
      );
      setQaRequests((prev) => prev.filter((reqId) => reqId !== id));
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "rgb(26, 26, 26)",
        fontFamily: "'Roboto', sans-serif",
      }}
    >
      {/* Main Video Area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "20px",
          gap: "10px",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns:
              activeQaUsers.length > 0
                ? "repeat(auto-fit, minmax(300px, 2fr))"
                : "1fr",
            gap: "10px",
            maxHeight: "80vh",
            overflowY: "auto",
            padding: "10px",
            background: "rgb(51, 51, 51)",
            borderRadius: "8px",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
          }}
        >
          {/* Host Video */}
          <div
            style={{
              position: "relative",
              borderRadius: "8px",
              overflow: "hidden",
              // height: "fit-content",
              // width: "fit-content",
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: "100%",
                height: activeQaUsers.length > 0 ? "300px" : "80vh",
                objectFit: "contain",
                background: "#000",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: "10px",
                left: "10px",
                background: "rgba(0, 0, 0, 0.6)",
                color: "#fff",
                padding: "5px 10px",
                borderRadius: "4px",
                fontSize: "14px",
              }}
            >
              Host
            </div>
          </div>
          {/* Q&A Videos */}
          {activeQaUsers.map((userId) =>
            peers[userId]?.stream ? (
              <div
                key={`qa-${userId}`}
                style={{
                  position: "relative",
                  borderRadius: "8px",
                  overflow: "hidden",
                  height: "fit-content",
                  width: "fit-content",
                }}
              >
                <video
                  autoPlay
                  playsInline
                  ref={(el) => el && (el.srcObject = peers[userId].stream)}
                  style={{
                    width: "100%",
                    height: "300px",
                    objectFit: "cover",
                    background: "#000",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: "10px",
                    left: "10px",
                    background: "rgba(0, 0, 0, 0.6)",
                    color: "#fff",
                    padding: "5px 10px",
                    borderRadius: "4px",
                    fontSize: "14px",
                  }}
                >
                  User {userId}
                </div>
              </div>
            ) : null
          )}
        </div>
        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "10px",
            padding: "10px",
            background: "rgb(51, 51, 51)",
            borderRadius: "8px",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
          }}
        >
          <button
            style={{
              padding: "8px 16px",
              background: socketStatus === "connected" ? "#4caf50" : "#f44336",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {socketStatus === "connected" ? "Connected" : "Disconnected"}
          </button>
        </div>
      </div>
      {/* Sidebar */}
      <div
        style={{
          width: "300px",
          background: "rgb(51, 51, 51)",
          display: "flex",
          flexDirection: "column",
          padding: "10px",
          gap: "10px",
          overflowY: "auto",
        }}
      >
        {/* Chat */}
        <ChatBox messages={chatMessages} sendMessage={sendMessage} />
        {/* Q&A Requests */}
        <div>
          <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#fff" }}>
            Q&A Requests
          </h3>
          {qaRequests.map((id) => (
            <div
              key={id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px",
                background: "rgb(114, 96, 96)",
                borderRadius: "4px",
                marginBottom: "10px",
              }}
            >
              <span>User {id}</span>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => approveQA(id)}
                  style={{
                    padding: "5px 10px",
                    background: "#4caf50",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => denyQA(id)}
                  style={{
                    padding: "5px 10px",
                    background: "#f44336",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                  }}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
        {/* Participants */}
        <div>
          <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#fff" }}>
            Participants
          </h3>
          {Object.keys(peers).map((id) => (
            <div
              key={id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px",
                background: mutedUsers.includes(id)
                  ? "#ffebee"
                  : "rgb(114, 96, 96)",
                borderRadius: "4px",
                marginBottom: "10px",
              }}
            >
              <span>
                User {id} {activeQaUsers.includes(id) ? "(Q&A)" : ""}
              </span>
              <button
                onClick={() =>
                  mutedUsers.includes(id) ? unMuteUser(id) : muteUser(id)
                }
                style={{
                  padding: "5px 10px",
                  background: mutedUsers.includes(id) ? "#f44336" : "#4caf50",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                }}
              >
                {mutedUsers.includes(id) ? "Unmute" : "Mute"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Host;
