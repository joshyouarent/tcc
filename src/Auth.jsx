// ============================================================
// Sign in
//
// A magic link rather than a password: you type your email, we send a link,
// clicking it signs you in on that device. Nothing to remember, nothing to
// leak. Signing in on a second device pulls the same history down.
// ============================================================

import React, { useState } from "react";
import { FONT, TYPE, THEME } from "./kernel/theme.js";
import { signInWithEmail } from "./kernel/sync.js";

export default function Auth({ theme }) {
  const c = THEME[theme];
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || state === "sending") return;
    setState("sending");
    const { error } = await signInWithEmail(email.trim());
    if (error) {
      setState("error");
      setMessage(error.message || "That did not send. Try again in a moment.");
    } else {
      setState("sent");
      setMessage("Check " + email.trim() + " and click the link. You can close this tab.");
    }
  };

  const panel = {
    border: `1px solid ${c.border}`, background: c.panel,
    borderRadius: "10px", padding: "16px", marginBottom: "14px",
  };
  const input = {
    background: c.bg, border: `1px solid ${c.border}`, color: c.text,
    fontFamily: FONT, fontSize: TYPE.input, borderRadius: "6px",
    padding: "10px 12px", width: "100%",
  };
  const button = {
    background: c.soft, border: `1px solid ${c.borderStrong}`, color: c.accentText,
    fontFamily: FONT, fontSize: TYPE.body, fontWeight: 600, borderRadius: "6px",
    padding: "10px 16px", cursor: valid ? "pointer" : "not-allowed",
    opacity: valid ? 1 : 0.5, whiteSpace: "nowrap",
  };

  if (state === "sent") {
    return (
      <div style={panel}>
        <div style={{ color: c.good, fontSize: TYPE.body, fontWeight: 600, marginBottom: "6px" }}>
          Link sent
        </div>
        <div style={{ color: c.muted, fontSize: TYPE.small }}>{message}</div>
      </div>
    );
  }

  return (
    <div style={panel}>
      <div style={{ color: c.ring, fontSize: TYPE.micro, letterSpacing: "2px", fontWeight: 700, marginBottom: "8px" }}>
        SIGN IN TO SYNC
      </div>
      <div style={{ color: c.muted, fontSize: TYPE.small, marginBottom: "12px" }}>
        Your history follows you between phone and laptop. Without this, entries
        stay in this browser only.
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
          style={{ ...input, flex: "1 1 220px" }}
        />
        <button type="submit" disabled={!valid || state === "sending"} style={button}>
          {state === "sending" ? "Sending..." : "Send link"}
        </button>
      </form>
      {state === "error" && (
        <div style={{ color: c.danger, fontSize: TYPE.small, marginTop: "10px" }}>{message}</div>
      )}
    </div>
  );
}
