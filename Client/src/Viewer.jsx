import React, { useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
import ChatBox from "./ChatBox";
import { v4 as uuidv4 } from "uuid";
import { useParams } from "react-router-dom";
const viewerId = uuidv4();

const Viewer = () => {
  const { streamId } = useParams();
  const videoRef = useRef();
  const localVideoRef = useRef();
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const qaPeersRef = useRef({});
  const signalQueueRef = useRef([]);
  const [qaPeers, setQaPeers] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [streamActive, setStreamActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qaStatus, setQaStatus] = useState("idle");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [autoplayFailed, setAutoplayFailed] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState([]);

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
    credential: "openrelayproject",
  }
];

  const sendQueuedSignals = () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    while (signalQueueRef.current.length > 0) {
      const signalData = signalQueueRef.current.shift();
      socketRef.current.send(JSON.stringify(signalData));
    }
  };

  const connectWebSocket = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      setConnectionStatus("connected");
      sendQueuedSignals();
      return;
    }
    const wsUrl = "wss://videostreaming-zkt4.onrender.com" || "ws://localhost:8880";
    socketRef.current = new WebSocket(wsUrl);
    const socket = socketRef.current;

    socket.onopen = () => {
      setConnectionStatus("connected");
      socket.send(
        JSON.stringify({
          type: "register",
          payload: { userId: viewerId, role: "viewer", streamId },
        })
      );
      sendQueuedSignals();
    };

    socket.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "signal" && msg.payload.to === viewerId) {
          const fromId = msg.payload.from;
          if (fromId === streamId && peerRef.current) {
            peerRef.current.signal(msg.payload.signal);
          } else if (qaPeersRef.current[fromId]) {
            qaPeersRef.current[fromId].signal(msg.payload.signal);
          }
        } else if (msg.type === "approve" && msg.payload.to === viewerId) {
          setQaStatus("approved");
          startViewerStream();
        } else if (msg.type === "deny" && msg.payload.to === viewerId) {
          setQaStatus("idle");
          alert("Request Denied");
        } else if (msg.type === "chat") {
          setChatMessages((prev) => [...prev, msg.payload]);
        } else if (msg.type === "qa_stream" && msg.payload.from !== viewerId) {
          startQaPeer(msg.payload.from);
          setConnectedPeers((prev) => [
            ...new Set([...prev, msg.payload.from]),
          ]);
        } else if (msg.type === "peer_list") {
          setConnectedPeers(msg.payload.peers.filter((id) => id !== viewerId));
        }
      } catch (err) {
        console.error("Viewer message parse error:", err);
      }
    };

    socket.onerror = () => setConnectionStatus("error");

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 2000;

    socket.onclose = (event) => {
      setConnectionStatus("disconnected");
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
        setTimeout(connectWebSocket, delay);
        reconnectAttempts++;
      } else {
        setConnectionStatus("failed");
      }
    };
  };

  const startQaPeer = (qaUserId) => {
    if (qaPeersRef.current[qaUserId]) return;
    const peer = new Peer({
      initiator: true,
      trickle: true,
      config: { iceServers },
    });

    peer.on("signal", (signal) => {
      const signalData = {
        type: "signal",
        payload: { to: qaUserId, from: viewerId, signal },
      };
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify(signalData));
      } else {
        signalQueueRef.current.push(signalData);
      }
    });

    peer.on("stream", (stream) => {
      setQaPeers((prev) => ({
        ...prev,
        [qaUserId]: { peer, stream },
      }));
    });

    peer.on("error", (err) =>
      console.error(`Q&A peer ${qaUserId} error:`, err)
    );

    peer.on("close", () => {
      delete qaPeersRef.current[qaUserId];
      setQaPeers((prev) => {
        const newPeers = { ...prev };
        delete newPeers[qaUserId];
        return newPeers;
      });
      setConnectedPeers((prev) => prev.filter((id) => id !== qaUserId));
    });

    qaPeersRef.current[qaUserId] = peer;
    setQaPeers((prev) => ({
      ...prev,
      [qaUserId]: { peer, stream: null },
    }));
  };

  const startViewerStream = async () => {
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current
          .play()
          .catch((err) => console.error("Local video play error:", err));
      }
      peerRef.current.addStream(localStream);
      Object.values(qaPeersRef.current).forEach((peer) => {
        peer.addStream(localStream);
      });
    } catch (err) {
      console.error("Viewer stream error:", err);
      setQaStatus("idle");
    }
  };

  const playStream = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current
        .play()
        .then(() => {
          setAutoplayFailed(false);
          setStreamActive(true);
        })
        .catch((err) => {
          console.error("Manual play error:", err);
          setAutoplayFailed(true);
        });
    }
  };

  useEffect(() => {
    const setupViewer = async () => {
      const waitForWebSocket = () =>
        new Promise((resolve) => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            resolve();
          } else {
            socketRef.current?.addEventListener("open", resolve, {
              once: true,
            });
          }
        });

      connectWebSocket();
      await waitForWebSocket();

      peerRef.current = new Peer({
        initiator: true,
        trickle: true,
        config: { iceServers },
      });

      peerRef.current.on("signal", (signal) => {
        const signalData = {
          type: "signal",
          payload: { to: streamId, from: viewerId, signal },
        };
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify(signalData));
        } else {
          signalQueueRef.current.push(signalData);
        }
      });

      peerRef.current.on("stream", (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current
            .play()
            .then(() => {
              setStreamActive(true);
              setAutoplayFailed(false);
            })
            .catch((err) => {
              console.error("Video play error:", err);
              setAutoplayFailed(true);
            });
        }
      });

      peerRef.current.on("error", (err) => console.error("Peer error:", err));
    };

    setupViewer();

    return () => {
      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        socketRef.current.close();
      }
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
      }
      Object.values(qaPeersRef.current).forEach((peer) => {
        if (!peer.destroyed) peer.destroy();
      });
      qaPeersRef.current = {};
      signalQueueRef.current = [];
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [streamId]);
  console.log(connectedPeers, "connectedPeers");
  // Reassign host stream on re-render
  useEffect(() => {
    if (videoRef.current && !videoRef.current.srcObject && peerRef.current) {
      peerRef.current.on("stream", (stream) => {
        videoRef.current.srcObject = stream;
        videoRef.current
          .play()
          .then(() => {
            setStreamActive(true);
            setAutoplayFailed(false);
          })
          .catch((err) => {
            console.error("Video play error:", err);
            setAutoplayFailed(true);
          });
      });
    }
  }, [qaPeers, qaStatus]);

  const requestQA = () => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "request",
          payload: { to: streamId, from: viewerId },
        })
      );
      setQaStatus("requested");
    } else {
      alert("WebSocket disconnected. Please try reconnecting.");
    }
  };

  const sendMessage = (text) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "chat",
          payload: { from: viewerId, text, to: streamId },
        })
      );
    } else {
      alert("WebSocket disconnected. Please try reconnecting.");
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

  const retryConnection = () => {
    setConnectionStatus("connecting");
    if (socketRef.current) {
      socketRef.current.close();
    }
    connectWebSocket();
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
              Object.keys(qaPeers).length > 0 || qaStatus === "approved"
                ? "repeat(auto-fit, minmax(300px, 1fr))"
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
              height:
               qaStatus === "approved"
                  ? "fit-content"
                  : "100%",
            }}
          >
            <video
              key="host-video"
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                height:
                  Object.keys(qaPeers).length > 0 || qaStatus === "approved"
                    ? "300px"
                    : "100%",
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
              Host
            </div>
          </div>
          {/* Local Video (if Q&A approved) */}
          {qaStatus === "approved" && (
            <div
              style={{
                position: "relative",
                borderRadius: "8px",
                overflow: "hidden",
                height: "fit-content",
              }}
            >
              <video
                key="local-video"
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
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
                You
              </div>
            </div>
          )}
          {/* Q&A Peers */}
          {Object.keys(qaPeers).map((userId) =>
            qaPeers[userId]?.stream ? (
              <div
                key={`qa-${userId}`}
                style={{
                  position: "relative",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={(el) => {
                    if (el && qaPeers[userId]?.stream) {
                      el.srcObject = qaPeers[userId].stream;
                    }
                  }}
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
          {autoplayFailed && (
            <button
              onClick={playStream}
              style={{
                padding: "8px 16px",
                background: "#ffaa00",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
              }}
            >
              Start Stream
            </button>
          )}
          <button
            onClick={requestQA}
            disabled={qaStatus !== "idle" || connectionStatus !== "connected"}
            style={{
              padding: "8px 16px",
              background:
                qaStatus === "idle" && connectionStatus === "connected"
                  ? "#4caf50"
                  : qaStatus === "requested"
                  ? "#ffaa00"
                  : "#666",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor:
                qaStatus === "idle" && connectionStatus === "connected"
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            {qaStatus === "idle"
              ? "Request Q&A"
              : qaStatus === "requested"
              ? "Waiting for Approval"
              : "In Q&A"}
          </button>
          {connectionStatus === "failed" && (
            <button
              onClick={retryConnection}
              style={{
                padding: "8px 16px",
                background: "#ffaa00",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
              }}
            >
              Retry Connection
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            style={{
              padding: "8px 16px",
              background: "#2196f3",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
            }}
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>
      {/* Sidebar */}
      <div
        style={{
          width: "400px",
          background: "rgb(51, 51, 51)",
          borderLeft: "1px solid rgb(51, 51, 51)",
          display: "flex",
          flexDirection: "column",
          padding: "10px",
          gap: "10px",
          overflowY: "auto",
        }}
      >
        {/* Chat */}
        <ChatBox messages={chatMessages} sendMessage={sendMessage} />

        {/* Participants */}
        <div>
          <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#fff" }}>
            Participants
          </h3>
          {/* // .filter(
          //   (userId) =>
          //     !Object.keys(qaPeers).includes(userId) && userId !== viewerId
          // ) */}
          {connectedPeers.map((userId) => (
            <div
              key={userId}
              style={{
                padding: "10px",
                background: "#fff",
                borderRadius: "4px",
                marginBottom: "10px",
                textAlign: "center",
              }}
            >
              User {userId}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Viewer;
