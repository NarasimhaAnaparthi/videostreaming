import React, { useState, useRef, useEffect } from "react";

const ChatBox = ({ messages, sendMessage }) => {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      style={{
        background: "#2a2a2a",
        borderRadius: "8px",
        padding: "15px",
        height: "50vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          maxHeight: "40vh",
          overflowY: "auto",
          marginBottom: "10px",
          padding: "10px",
          background: "#333",
          borderRadius: "5px",
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              margin: "5px 0",
              padding: "8px",
              background: m.from === 0 ? "#00ccff" : "#555",
              borderRadius: "5px",
              color: "#fff",
              maxWidth: "70%",
              alignSelf: m.from === 0 ? "flex-end" : "flex-start",
            }}
          >
            <span style={{ fontSize: "12px", opacity: 0.7 }}>
              {m.sentBy + " : " + m.from}
            </span>
            <div>{m.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) =>
            e.key === "Enter" && input && (sendMessage(input), setInput(""))
          }
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "5px",
            border: "1px solid #00ccff",
            background: "#333",
            color: "#fff",
            outline: "none",
            transition: "border-color 0.3s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#00e6ff")}
          onBlur={(e) => (e.target.style.borderColor = "#00ccff")}
          placeholder="Type a message..."
        />
        <button
          onClick={() => {
            if (input) {
              sendMessage(input);
              setInput("");
            }
          }}
          style={{
            padding: "10px 20px",
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
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatBox;
