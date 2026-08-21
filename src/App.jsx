import React, { useState, useEffect, useMemo, useRef } from "react";
import Chart from "./kernel/Chart.jsx";
import { scoreValue, progress, zoneOf, SHAPES } from "./kernel/scoring.js";
import { FONT, TYPE, THEME } from "./kernel/theme.js";
import {
  loadConfig, saveConfig, loadEntries, saveEntries, setEntry, valueFor,
  today, addDays, daysBack, WINDOWS, ROLLUPS,
} from "./kernel/store.js";
import { DOMAINS, defaultConfig } from "./domains.js";
import Auth from "./Auth.jsx";
import {
  configured, currentSession, onAuthChange, signOut,
  pullAll, mergeEntries, flush, queueEntry, queueConfig,
  pendingCount, readQueueRaw,
} from "./kernel/sync.js";

const SCALES = [
  { id: "now", name: "Now", days: 1 },
  { id: "week", name: "Week", days: 7 },
  { id: "month", name: "Month", days: 30 },
];

export default function App() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    if (window.matchMedia) {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      setTheme(mql.matches ? "dark" : "light");
      const h = (e) => setTheme(e.matches ? "dark" : "light");
      mql.addEventListener?.("change", h);
      return () => mql.removeEventListener?.("change", h);
    }
  }, []);
  const c = THEME[theme];

  const [config, setConfig] = useState(() => loadConfig(defaultConfig()));
  const [entries, setEntries] = useState(() => loadEntries());
  const [tab, setTab] = useState("home");
  const [scale, setScale] = useState("now");
  const [setup, setSetup] = useState(false);
  const [date, setDate] = useState(today());

  // ---- sync state
  const [session, setSession] = useState(null);
  const [pending, setPending] = useState(() => (configured ? pendingCount() : 0));
  const [pulling, setPulling] = useState(false);
  const userId = session && session.user ? session.user.id : null;

  // Refs so the config effect can see the current user without re-firing on
  // sign-in, and so hydration does not push what it just pulled back up.
  const userIdRef = useRef(null);
  const hydrating = useRef(false);
  const firstConfig = useRef(true);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  const refreshPending = () => setPending(configured ? pendingCount() : 0);

  // Watch the session. detectSessionInUrl means clicking the emailed link
  // lands here already signed in.
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    currentSession().then((s) => { if (alive) setSession(s); });
    const stop = onAuthChange((s) => setSession(s));
    return () => { alive = false; stop(); };
  }, []);

  // On sign-in: send anything queued, then pull the server's copy and merge
  // whatever this device still has in flight over the top of it.
  useEffect(() => {
    if (!configured || !userId) return;
    let alive = true;
    setPulling(true);
    (async () => {
      await flush(userId);
      const remote = await pullAll(userId);
      if (!alive) return;
      if (remote) {
        hydrating.current = true;
        const merged = mergeEntries(remote.entries, readQueueRaw());
        saveEntries(merged);
        setEntries(merged);
        if (remote.config && remote.config.metrics) setConfig(remote.config);
        setTimeout(() => { hydrating.current = false; }, 0);
      }
      refreshPending();
      setPulling(false);
    })();
    return () => { alive = false; };
  }, [userId]);

  // Retry the queue when the device comes back online.
  useEffect(() => {
    if (!configured) return;
    const retry = () => {
      const id = userIdRef.current;
      if (id) flush(id).then(refreshPending);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  useEffect(() => {
    saveConfig(config);
    if (firstConfig.current) { firstConfig.current = false; return; }
    if (hydrating.current) return;
    const id = userIdRef.current;
    if (!configured || !id) return;
    queueConfig(config);
    refreshPending();
    flush(id).then(refreshPending);
  }, [config]);

  const metrics = config.metrics || [];
  const activeIn = (domainId) => metrics.filter((m) => m.domain === domainId && m.on);

  // A domain scores the mean of whatever you have switched on inside it.
  const domainScore = (domainId, endDate = today()) => {
    const list = activeIn(domainId);
    if (!list.length) return null;
    const scores = list.map((m) => scoreValue(valueFor(entries, m, endDate), m)).filter((s) => s != null);
    if (!scores.length) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  // Local first so the chart moves immediately, then queued for the server.
  const log = (metricId, value) => {
    setEntries((prev) => setEntry(prev, date, metricId, value));
    if (!configured) return;
    const blank = value === "" || value == null;
    const num = Number(value);
    queueEntry(date, metricId, blank || Number.isNaN(num) ? null : num);
    refreshPending();
    const id = userIdRef.current;
    if (id) flush(id).then(refreshPending);
  };

  const toggleMetric = (id) => setConfig({
    ...config,
    metrics: metrics.map((m) => (m.id === id ? { ...m, on: !m.on } : m)),
  });

  const editMetric = (id, patch) => setConfig({
    ...config,
    metrics: metrics.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  });

  // ---- styles
  const panel = { border: `1px solid ${c.border}`, background: c.panel };
  const input = { background: c.panel, border: `1px solid ${c.border}`, color: c.text,
    fontFamily: FONT, fontSize: TYPE.input, borderRadius: "6px", padding: "9px 10px", width: "100%" };
  const head = { color: c.ring, fontSize: TYPE.micro, letterSpacing: "2px", fontWeight: 700 };
  const chip = (on) => ({
    border: `1px solid ${on ? c.accent : c.line}`,
    background: on ? c.soft : "transparent",
    color: on ? c.accentText : c.muted,
    fontFamily: FONT, fontSize: TYPE.small, borderRadius: "6px",
    padding: "8px 12px", cursor: "pointer",
  });
  const primaryBtn = { background: c.soft, border: `1px solid ${c.borderStrong}`, color: c.accentText,
    fontFamily: FONT, fontSize: TYPE.body, fontWeight: 600, borderRadius: "6px",
    padding: "12px", width: "100%", cursor: "pointer" };

  // ---- the four domain spokes, or one spoke per day
  const homeChart = useMemo(() => {
    if (scale === "now") {
      return {
        spokes: DOMAINS.map((d) => ({ label: d.name })),
        series: [{ label: "now", values: DOMAINS.map((d) => domainScore(d.id)), closed: false }],
        join: false,
      };
    }
    const s = SCALES.find((x) => x.id === scale);
    const days = daysBack(s.days);
    return {
      spokes: days.map((d) => ({ label: d.slice(8) })),
      series: DOMAINS.map((dom, i) => ({
        label: dom.name,
        values: days.map((day) => domainScore(dom.id, day)),
        opacity: 1 - i * 0.18,
      })),
      join: true,
    };
  }, [scale, entries, config]);

  const domainTab = DOMAINS.find((d) => d.id === tab);

  return (
    <div style={{ background: c.bg, color: c.text, minHeight: "100vh", fontFamily: FONT,
      padding: "16px", maxWidth: "760px", margin: "0 auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
        <h1 style={{ color: c.accentText, fontSize: TYPE.strong, letterSpacing: "3px", margin: 0 }}>T.C.C.</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setSetup(!setup)} style={chip(setup)}>Setup</button>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={chip(false)}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          {configured && session && (
            <button onClick={() => signOut()} style={chip(false)}>Sign out</button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
        <button onClick={() => setTab("home")} style={chip(tab === "home")}>ALL</button>
        {DOMAINS.map((d) => (
          <button key={d.id} onClick={() => setTab(d.id)} style={chip(tab === d.id)}>{d.app}</button>
        ))}
      </div>

      {configured && !session && <Auth theme={theme} />}

      {setup && (
        <div style={{ ...panel, borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ ...head, marginBottom: "10px" }}>METRICS</div>
          <div style={{ color: c.faint, fontSize: TYPE.small, marginBottom: "12px" }}>
            Switch on the few you are focusing on. Each carries its own landmarks, so
            the chart reads the same whatever the unit.
          </div>
          {DOMAINS.map((d) => (
            <div key={d.id} style={{ marginBottom: "16px" }}>
              <div style={{ ...head, marginBottom: "8px" }}>{d.name}</div>
              {metrics.filter((m) => m.domain === d.id).map((m) => (
                <div key={m.id} style={{ border: `1px solid ${c.line}`, borderRadius: "8px",
                  padding: "10px", marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: TYPE.body, fontWeight: 500 }}>{m.name}</div>
                      <div style={{ color: c.faint, fontSize: TYPE.micro }}>
                        {m.floor} to {m.ceiling} {m.unit} · {WINDOWS[m.window].name.toLowerCase()} · {ROLLUPS[m.rollup].name.toLowerCase()}
                      </div>
                    </div>
                    <button onClick={() => toggleMetric(m.id)} style={chip(m.on)}>
                      {m.on ? "On" : "Off"}
                    </button>
                  </div>
                  {m.on && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                      <label style={{ flex: "1 1 90px" }}>
                        <div style={{ color: c.faint, fontSize: TYPE.micro, marginBottom: "4px" }}>Floor</div>
                        <input type="number" inputMode="decimal" value={m.floor} style={input}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => editMetric(m.id, { floor: Number(e.target.value) })} />
                      </label>
                      <label style={{ flex: "1 1 90px" }}>
                        <div style={{ color: c.faint, fontSize: TYPE.micro, marginBottom: "4px" }}>Ceiling</div>
                        <input type="number" inputMode="decimal" value={m.ceiling} style={input}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => editMetric(m.id, { ceiling: Number(e.target.value) })} />
                      </label>
                      <label style={{ flex: "2 1 160px" }}>
                        <div style={{ color: c.faint, fontSize: TYPE.micro, marginBottom: "4px" }}>Shape</div>
                        <select value={m.shape} style={input}
                          onChange={(e) => editMetric(m.id, { shape: e.target.value })}>
                          {Object.keys(SHAPES).map((k) => (
                            <option key={k} value={k}>{SHAPES[k].name}</option>
                          ))}
                        </select>
                      </label>
                      <div style={{ color: c.faint, fontSize: TYPE.micro, flexBasis: "100%" }}>
                        {SHAPES[m.shape].what}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === "home" && (
        <>
          <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
            {SCALES.map((s) => (
              <button key={s.id} onClick={() => setScale(s.id)} style={chip(scale === s.id)}>{s.name}</button>
            ))}
          </div>

          <div style={{ ...panel, borderRadius: "10px", padding: "10px", marginBottom: "14px" }}>
            <Chart spokes={homeChart.spokes} series={homeChart.series} c={c}
              join={homeChart.join} showQuadrants={scale === "now"} />
          </div>

          <div style={{ ...panel, borderRadius: "10px", padding: "14px" }}>
            <div style={{ ...head, marginBottom: "10px" }}>WHERE YOU ARE</div>
            {DOMAINS.map((d) => {
              const sc = domainScore(d.id);
              const zone = zoneOf(sc);
              const n = activeIn(d.id).length;
              return (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "baseline", padding: "8px 0", borderTop: `1px solid ${c.line}`, gap: "10px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: TYPE.body, fontWeight: 600 }}>{d.name}</div>
                    <div style={{ color: c.faint, fontSize: TYPE.micro }}>
                      {n} {n === 1 ? "metric" : "metrics"} on
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: TYPE.numeral, fontWeight: 600,
                      color: sc == null ? c.faint : zone === "beyond" ? c.good : zone === "in" ? c.accentText : c.danger }}>
                      {sc == null ? "\u2013" : Math.round(sc)}
                    </div>
                    <div style={{ color: c.faint, fontSize: TYPE.micro }}>
                      {sc == null ? "nothing on" : zone === "in" ? "in the band" : zone === "beyond" ? "past the ceiling" : "under the floor"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {domainTab && (
        <>
          <div style={{ ...panel, borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
            <div style={{ ...head, marginBottom: "6px" }}>{domainTab.name}</div>
            <div style={{ fontSize: TYPE.body }}>{domainTab.definition}</div>
            <div style={{ color: c.faint, fontSize: TYPE.small, marginTop: "4px" }}>{domainTab.measure}</div>
          </div>

          {activeIn(domainTab.id).length > 0 ? (
            <div style={{ ...panel, borderRadius: "10px", padding: "10px", marginBottom: "14px" }}>
              <Chart c={c} showQuadrants={false} join={false}
                spokes={activeIn(domainTab.id).map((m) => ({ label: m.name }))}
                series={[{ label: "now",
                  values: activeIn(domainTab.id).map((m) => scoreValue(valueFor(entries, m), m)) }]} />
            </div>
          ) : (
            <div style={{ ...panel, borderRadius: "10px", padding: "14px", marginBottom: "14px",
              color: c.faint, fontSize: TYPE.small }}>
              Nothing switched on. Open Setup and choose what to focus on.
            </div>
          )}

          <div style={{ ...panel, borderRadius: "10px", padding: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={head}>LOG</div>
              <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)}
                style={{ ...input, width: "auto", fontSize: TYPE.small, padding: "6px 8px" }} />
            </div>

            {activeIn(domainTab.id).map((m) => {
              const todayVal = (entries[date] || {})[m.id];
              const windowVal = valueFor(entries, m);
              const sc = scoreValue(windowVal, m);
              const pr = progress(windowVal, m);
              return (
                <div key={m.id} style={{ borderTop: `1px solid ${c.line}`, padding: "12px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
                    <div style={{ fontSize: TYPE.body, fontWeight: 500, minWidth: 0 }}>{m.name}</div>
                    <div style={{ color: c.faint, fontSize: TYPE.micro, flexShrink: 0 }}>
                      {Math.round(windowVal * 10) / 10} {m.unit} · {WINDOWS[m.window].name.toLowerCase()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "8px" }}>
                    <input type="number" inputMode="decimal" placeholder={`${m.unit} on this day`}
                      value={todayVal == null ? "" : todayVal} style={{ ...input, flex: 1 }}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => log(m.id, e.target.value)} />
                    <div style={{ minWidth: "72px", textAlign: "right" }}>
                      <div style={{ fontSize: TYPE.body, fontWeight: 600,
                        color: sc == null ? c.faint : zoneOf(sc) === "under" ? c.danger : zoneOf(sc) === "beyond" ? c.good : c.accentText }}>
                        {sc == null ? "\u2013" : Math.round(sc)}
                      </div>
                      <div style={{ color: c.faint, fontSize: TYPE.micro }}>
                        {Math.round(pr.pct)}% {pr.label}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ color: c.faint, fontSize: TYPE.micro, marginTop: "20px", textAlign: "center" }}>
        {!configured
          ? "Saved on this device. Yesterday carries into today."
          : !session
            ? "Saved on this device. Sign in to carry it across your devices."
            : pulling
              ? "Catching up with your other devices..."
              : pending > 0
                ? `Saved. ${pending} change${pending === 1 ? "" : "s"} waiting to sync.`
                : `Synced to ${session.user.email}. Yesterday carries into today.`}
      </div>
    </div>
  );
}
