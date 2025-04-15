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
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  const sendQueuedSignals = () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    while (signalQueueRef.current.length > 0) {
      const signalData = signalQueueRef.current.shift();
      socketRef.current.send(JSON.stringify(signalData));
      console.log("Sent queued signal:", signalData);
    }
  };

  const connectWebSocket = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log("WebSocket already open for viewer:", viewerId);
      setConnectionStatus("connected");
      sendQueuedSignals();
      return;
    }

    const wsUrl =
      "wss://videostreaming-zkt4.onrender.com" || "ws://192.168.1.36:8880";
    console.log(`Attempting to connect to WebSocket: ${wsUrl}`);

    try {
      socketRef.current = new WebSocket(wsUrl);
    } catch (err) {
      console.error("WebSocket initialization error:", err);
      setConnectionStatus("error");
      return;
    }

    const socket = socketRef.current;

    socket.onopen = () => {
      console.log("Viewer WebSocket connected, viewerId:", viewerId);
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
        console.log("Viewer received:", msg);
        if (msg.type === "signal" && msg.payload.to === viewerId) {
          const fromId = msg.payload.from;
          if (fromId === streamId && peerRef.current) {
            peerRef.current.signal(msg.payload.signal);
            console.log("Viewer processed signal from Host");
          } else if (qaPeersRef.current[fromId]) {
            qaPeersRef.current[fromId].signal(msg.payload.signal);
            console.log(`Viewer processed signal from Q&A peer ${fromId}`);
          }
        } else if (msg.type === "approve" && msg.payload.to === viewerId) {
          console.log("Viewer approved for Q&A");
          setQaStatus("approved");
          startViewerStream();
        } else if (msg.type === "deny" && msg.payload.to === viewerId) {
          console.log("Viewer Q&A denied");
          setQaStatus("idle");
          alert("Request Denied");
        } else if (msg.type === "chat") {
          console.log("Viewer received chat:", msg.payload);
          setChatMessages((prev) => [...prev, msg.payload]);
        } else if (msg.type === "qa_stream" && msg.payload.from !== viewerId) {
          console.log(`Starting Q&A stream for ${msg.payload.from}`);
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

    socket.onerror = (err) => {
      console.error("Viewer WebSocket error:", err);
      setConnectionStatus("error");
    };

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 2000;

    socket.onclose = (event) => {
      console.log(
        `Viewer WebSocket closed: code=${event.code}, reason=${event.reason}`
      );
      setConnectionStatus("disconnected");
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
        console.log(
          `Reconnecting (${
            reconnectAttempts + 1
          }/${maxReconnectAttempts}) in ${delay}ms...`
        );
        setTimeout(connectWebSocket, delay);
        reconnectAttempts++;
      } else {
        console.error("Max reconnect attempts reached for viewer:", viewerId);
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
        console.log(`Viewer sent signal to Q&A peer ${qaUserId}:`, signal);
      } else {
        console.error(
          `Queuing signal to Q&A peer ${qaUserId}: WebSocket not open`
        );
        signalQueueRef.current.push(signalData);
      }
    });

    peer.on("stream", (stream) => {
      console.log(
        `Viewer received Q&A stream from ${qaUserId}:`,
        stream.getTracks()
      );
      setQaPeers((prev) => ({
        ...prev,
        [qaUserId]: { peer, stream },
      }));
    });

    peer.on("error", (err) =>
      console.error(`Q&A peer ${qaUserId} error:`, err)
    );

    peer.on("close", () => {
      console.log(`Q&A peer ${qaUserId} closed`);
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
      console.log("Viewer stream tracks:", localStream.getTracks());
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
      console.log("Viewer stream added to peers");
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
          console.log("Stream started manually");
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
            console.log("Waiting for WebSocket to connect...");
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
          console.log("Viewer sent signal to Host:", signal);
        } else {
          console.error("Queuing signal to Host: WebSocket not open");
          signalQueueRef.current.push(signalData);
        }
      });

      peerRef.current.on("stream", (stream) => {
        console.log("Viewer received Host stream:", stream.getTracks());
        const assignStream = () => {
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
                setTimeout(assignStream, 100);
              });
          } else {
            console.warn("Video ref not ready, retrying...");
            setTimeout(assignStream, 100);
          }
        };
        assignStream();
      });

      peerRef.current.on("error", (err) => console.error("Peer error:", err));

      peerRef.current.on("iceconnectionstatechange", () => {
        console.log("Viewer ICE state:", peerRef.current.iceConnectionState);
      });
      peerRef.current.on("signalingstatechange", () => {
        console.log("Viewer signaling state:", peerRef.current.signalingState);
      });
    };

    setupViewer();

    return () => {
      console.log("Cleaning up Viewer...");
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
    };
  }, [streamId]);

  const requestQA = () => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "request",
          payload: { to: streamId, from: viewerId },
        })
      );
      console.log("Viewer sent Q&A request");
      setQaStatus("requested");
    } else {
      console.error("Cannot request Q&A: WebSocket not open");
      alert("WebSocket disconnected. Please try reconnecting.");
    }
  };

  const sendMessage = (text) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "chat",
          payload: {
            from: viewerId,
            text,
            sentBy: "Host",
            to: streamId,
          },
        })
      );
      console.log("Viewer sent chat:", text);
    } else {
      console.error("Cannot send message: WebSocket not open");
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
    console.log("Manual WebSocket retry initiated");
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
          position: "relative",
        }}
      >
        {/* Main View: Host (initially) or Q&A Grid */}
        {Object.keys(qaPeers).length === 0 && qaStatus !== "approved" ? (
          <div
            style={{
              flex: 1,
              maxHeight: "60vh",
              borderRadius: "10px",
              overflow: "hidden",
              boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
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
                height: "100%",
                objectFit: "cover",
                background: "#000",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: "10px",
                left: "10px",
                background: "rgba(0, 0, 0, 0.7)",
                padding: "5px",
                borderRadius: "5px",
                fontSize: "14px",
              }}
            >
              Host
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              gap: "10px",
              maxHeight: "60vh",
              overflowY: "auto",
            }}
          >
            {/* Host Video */}
            <div
              style={{
                position: "relative",
                borderRadius: "10px",
                boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
                overflow: "hidden",
                height: "fit-content",
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
                  height: "200px",
                  objectFit: "cover",
                  background: "#000",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "10px",
                  background: "rgba(0, 0, 0, 0.7)",
                  padding: "5px",
                  borderRadius: "5px",
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
                  borderRadius: "10px",
                  boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
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
                    height: "200px",
                    objectFit: "cover",
                    background: "#000",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: "10px",
                    left: "10px",
                    background: "rgba(0, 0, 0, 0.7)",
                    padding: "5px",
                    borderRadius: "5px",
                    fontSize: "14px",
                  }}
                >
                  You
                </div>
              </div>
            )}
            {/* Q&A Peers */}
            {Object.keys(qaPeers).map(
              (userId) =>
                qaPeers[userId]?.stream && (
                  <div
                    key={`qa-${userId}`}
                    style={{
                      position: "relative",
                      borderRadius: "10px",
                      boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
                      overflow: "hidden",
                      height: "fit-content",
                    }}
                  >
                    <video
                      ref={(el) =>
                        el && (el.srcObject = qaPeers[userId].stream)
                      }
                      autoPlay
                      muted
                      playsInline
                      style={{
                        width: "100%",
                        height: "200px",
                        objectFit: "cover",
                        background: "#000",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: "10px",
                        left: "10px",
                        background: "rgba(0, 0, 0, 0.7)",
                        padding: "5px",
                        borderRadius: "5px",
                        fontSize: "14px",
                      }}
                    >
                      User {userId}
                    </div>
                  </div>
                )
            )}
          </div>
        )}
        {/* Peer List: IDs for non-Q&A peers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: "10px",
            maxHeight: "20vh",
            overflowY: "auto",
          }}
        >
          {connectedPeers
            .filter(
              (userId) =>
                !Object.keys(qaPeers).includes(userId) && userId !== viewerId
            )
            .map((userId) => (
              <div
                key={userId}
                style={{
                  height: "100px",
                  borderRadius: "10px",
                  background: "#333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
                  fontSize: "14px",
                  textAlign: "center",
                }}
              >
                User {userId}
              </div>
            ))}
        </div>
        {autoplayFailed && (
          <button
            onClick={playStream}
            style={{
              padding: "8px 15px",
              background: "#ffaa00",
              border: "none",
              borderRadius: "5px",
              color: "#fff",
              cursor: "pointer",
              transition: "background 0.3s",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
            }}
            onMouseOver={(e) => (e.target.style.background = "#ffbb33")}
            onMouseOut={(e) => (e.target.style.background = "#ffaa00")}
          >
            Start Stream
          </button>
        )}
        <div
          style={{
            background: "#2a2a2a",
            padding: "10px",
            borderRadius: "8px",
            textAlign: "center",
            fontSize: "14px",
            color:
              connectionStatus === "connected"
                ? "#00ff00"
                : connectionStatus === "error" || connectionStatus === "failed"
                ? "#ff4444"
                : "#ffaa00",
          }}
        >
          Connection Status:{" "}
          {connectionStatus === "connected"
            ? "Connected"
            : connectionStatus === "disconnected"
            ? "Disconnected"
            : connectionStatus === "error"
            ? "Error"
            : connectionStatus === "failed"
            ? "Failed"
            : "Connecting"}
        </div>
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
          onClick={requestQA}
          disabled={qaStatus !== "idle" || connectionStatus !== "connected"}
          style={{
            padding: "8px 15px",
            background:
              qaStatus === "idle" && connectionStatus === "connected"
                ? "#00ccff"
                : qaStatus === "requested"
                ? "#ffaa00"
                : "#666",
            border: "none",
            borderRadius: "5px",
            color: "#fff",
            cursor:
              qaStatus === "idle" && connectionStatus === "connected"
                ? "pointer"
                : "not-allowed",
            transition: "background 0.3s",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
          }}
          onMouseOver={(e) =>
            qaStatus === "idle" &&
            connectionStatus === "connected" &&
            (e.target.style.background = "#00e6ff")
          }
          onMouseOut={(e) =>
            qaStatus === "idle" &&
            connectionStatus === "connected" &&
            (e.target.style.background = "#00ccff")
          }
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
              padding: "8px 15px",
              background: "#ffaa00",
              border: "none",
              borderRadius: "5px",
              color: "#fff",
              cursor: "pointer",
              transition: "background 0.3s",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
            }}
            onMouseOver={(e) => (e.target.style.background = "#ffbb33")}
            onMouseOut={(e) => (e.target.style.background = "#ffaa00")}
          >
            Retry Connection
          </button>
        )}
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
