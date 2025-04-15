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
    "wss://videostreaming-zkt4.onrender.com" || "ws://192.168.1.36:8880/";
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  const connectWebSocket = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log("WebSocket already open for host:", hostId);
      setSocketStatus("connected");
      return;
    }

    console.log(`Attempting to connect to WebSocket: ${SOCKETAPI}`);
    socketRef.current = new WebSocket(SOCKETAPI);
    const socket = socketRef.current;

    socket.onopen = () => {
      console.log("Host WebSocket connected, hostId:", hostId);
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
        console.log("Host received:", msg);
        if (msg.type === "signal") {
          const fromId = msg.payload.from;
          if (!peersRef.current[fromId]) {
            const stream = videoRef.current?.srcObject;
            if (!stream) {
              console.error("Host stream not available yet");
              return;
            }
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
                console.log("Host sent signal to:", fromId);
              } else {
                console.error(
                  "WebSocket not open, cannot send signal to:",
                  fromId
                );
              }
            });

            peer.on("stream", (viewerStream) => {
              console.log(
                "Host received Viewer stream:",
                fromId,
                viewerStream.getTracks()
              );
              setPeers((prev) => ({
                ...prev,
                [fromId]: { peer, stream: viewerStream },
              }));
            });

            peer.on("error", (err) =>
              console.error("Peer error for", fromId, ":", err)
            );

            peer.on("close", () => {
              console.log(`Peer ${fromId} closed`);
              delete peersRef.current[fromId];
              setPeers((prev) => {
                const newPeers = { ...prev };
                delete newPeers[fromId];
                return newPeers;
              });
              setQaRequests((prev) => prev.filter((id) => id !== fromId));
              setActiveQaUsers((prev) => prev.filter((id) => id !== fromId));
            });

            peer.on("iceconnectionstatechange", () => {
              console.log(
                `Host ICE state for ${fromId}:`,
                peer.iceConnectionState
              );
            });
            peer.on("signalingstatechange", () => {
              console.log(
                `Host signaling state for ${fromId}:`,
                peer.signalingState
              );
            });

            peersRef.current[fromId] = peer;
            setPeers((prev) => ({
              ...prev,
              [fromId]: { peer, stream: null },
            }));
            console.log(
              `Created new peer for ${fromId}, Total peers: ${
                Object.keys(peersRef.current).length
              }`
            );
          }
          if (peersRef.current[fromId]) {
            peersRef.current[fromId].signal(msg.payload.signal);
            console.log("Host processed signal from:", fromId);
          }
        } else if (msg.type === "request") {
          console.log("Q&A request from:", msg.payload.from);
          setQaRequests((prev) => [...prev, msg.payload.from]);
        } else if (msg.type === "chat") {
          console.log("Host received chat:", msg.payload);
          setChatMessages((prev) => [...prev, msg.payload]);
        }
      } catch (err) {
        console.error("Host message parse error:", err);
      }
    };

    socket.onerror = (err) => {
      console.error("Host WebSocket error:", err);
      setSocketStatus("error");
    };

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 2000;

    socket.onclose = (event) => {
      console.log(
        `Host WebSocket closed: code=${event.code}, reason=${event.reason}`
      );
      setSocketStatus("disconnected");
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
        console.error("Max reconnect attempts reached for host:", hostId);
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
        console.log("Host stream tracks:", stream.getTracks());
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
      console.log("Cleaning up Host...");
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
    };
  }, [hostId]);

  const sendMessage = (text) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "chat",
          payload: {
            from: hostId,
            text,
            sentBy: "Host",
            to: null,
          },
        })
      );
      console.log("Host sent chat:", text);
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
      console.log("Host approved Q&A for:", id);
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
        {/* Main View: Host (initially) or Q&A Grid */}
        {activeQaUsers.length === 0 ? (
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
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                background: "#000",
              }}
            />
          </div>
        ) : (
          <div>
            {/* Host Video in Grid */}
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
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: "100%",
                  height: "200px",
                  objectFit: "cover",
                  background: "#000",
                  position: "absolute",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "1px",
                  background: "rgba(0, 0, 0, 0.7)",
                  padding: "5px",
                  borderRadius: "5px",
                  fontSize: "14px",
                }}
              >
                Host
              </div>
            </div>
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
              {/* Q&A Users in Grid */}
              {activeQaUsers.map((userId) =>
                peers[userId]?.stream ? (
                  <div
                    key={userId}
                    style={{
                      position: "relative",
                      borderRadius: "10px",
                      boxShadow: "0 4px 15px rgba(0, 0, 0, 0.5)",
                      overflow: "hidden",
                      height: "fit-content",
                    }}
                  >
                    <video
                      ref={(el) => el && (el.srcObject = peers[userId].stream)}
                      autoPlay
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
                        left: "1px",
                        width: "fit-content",
                        background: "rgba(0, 0, 0, 0.7)",
                        padding: "5px",
                        borderRadius: "5px",
                        fontSize: "14px",
                      }}
                    >
                      User {userId}
                    </div>
                  </div>
                ) : null
              )}
            </div>
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
          {Object.keys(peers)
            .filter((userId) => !activeQaUsers.includes(userId))
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
        <div
          style={{
            background: "#2a2a2a",
            padding: "15px",
            borderRadius: "8px",
          }}
        >
          <h3
            style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#00ccff" }}
          >
            Q&A Requests
          </h3>
          {qaRequests.map((id) => (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px",
                background: "#333",
                borderRadius: "5px",
                marginBottom: "10px",
              }}
            >
              <span style={{ fontSize: "14px" }}>User {id}</span>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => approveQA(id)}
                  style={{
                    padding: "5px 10px",
                    background: "#00ccff",
                    border: "none",
                    borderRadius: "5px",
                    color: "#fff",
                    cursor: "pointer",
                    transition: "background 0.3s",
                  }}
                  onMouseOver={(e) => (e.target.style.background = "#00e6ff")}
                  onMouseOut={(e) => (e.target.style.background = "#00ccff")}
                >
                  Approve
                </button>
                <button
                  onClick={() => denyQA(id)}
                  style={{
                    padding: "5px 10px",
                    background: "#ff6666",
                    border: "none",
                    borderRadius: "5px",
                    color: "#fff",
                    cursor: "pointer",
                    transition: "background 0.3s",
                  }}
                  onMouseOver={(e) => (e.target.style.background = "#ff8888")}
                  onMouseOut={(e) => (e.target.style.background = "#ff6666")}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
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
              <span style={{ fontSize: "14px" }}>
                User {id} {activeQaUsers.includes(id) ? "(Q&A)" : ""}
              </span>
              <button
                onClick={() => {
                  if (mutedUsers.includes(id)) unMuteUser(id);
                  else muteUser(id);
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
