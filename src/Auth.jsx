// ============================================================
// Sign in
//
// No password: you type your email and we send one message containing both a
// link and a six-digit code. Either signs you in.
//
// The code is not a fallback, it is the only thing that works from a home
// screen icon. iOS gives a home-screen app its own storage, separate from
// Safari, so tapping the link signs you in inside Safari and leaves the app
// itself still signed out. Typing the code signs in wherever it is typed.
// ============================================================

import React, { useState } from "react";
import { FONT, TYPE, THEME } from "./kernel/theme.js";
import { signInWithEmail, verifyEmailCode, isStandalone } from "./kernel/sync.js";

export default function Auth({ theme }) {
  const c = THEME[theme];
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | verifying | error
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const standalone = isStandalone();

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
      setMessage("");
    }
  };

  const codeValid = /^\d{6}$/.test(code.trim());

  const verify = async (e) => {
    e.preventDefault();
    if (!codeValid || state === "verifying") return;
    setState("verifying");
    const { error } = await verifyEmailCode(email.trim(), code.trim());
    if (error) {
      setState("sent");
      setMessage(error.message || "That code was not accepted. Check it and try again.");
    }
    // On success the auth listener swaps this panel out; nothing to do here.
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

  if (state === "sent" || state === "verifying") {
    return (
      <div style={panel}>
        <div style={{ color: c.good, fontSize: TYPE.body, fontWeight: 600, marginBottom: "6px" }}>
          Sent to {email.trim()}
        </div>
        <div style={{ color: c.muted, fontSize: TYPE.small, marginBottom: "12px" }}>
          {standalone
            ? "Enter the six-digit code from the email. The link in it will not sign you in here, because this app has its own storage separate from Safari."
            : "Enter the six-digit code from the email, or tap the link in it."}
        </div>
        <form onSubmit={verify} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); if (message) setMessage(""); }}
            style={{ ...input, flex: "1 1 140px", letterSpacing: "4px", fontWeight: 600 }}
          />
          <button type="submit" disabled={!codeValid || state === "verifying"}
            style={{ ...button, cursor: codeValid ? "pointer" : "not-allowed", opacity: codeValid ? 1 : 0.5 }}>
            {state === "verifying" ? "Checking..." : "Sign in"}
          </button>
        </form>
        {message && (
          <div style={{ color: c.danger, fontSize: TYPE.small, marginTop: "10px" }}>{message}</div>
        )}
        <button onClick={() => { setState("idle"); setCode(""); setMessage(""); }}
          style={{ background: "none", border: "none", color: c.faint, fontFamily: FONT,
            fontSize: TYPE.small, padding: "10px 0 0", cursor: "pointer", textDecoration: "underline" }}>
          Use a different email
        </button>
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
