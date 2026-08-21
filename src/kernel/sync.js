// ============================================================
// T.C.C. kernel: sync
//
// The local store stays the source of truth for reading, so the app never
// waits on the network to draw a chart. This layer mirrors it to Supabase so
// the same history shows up on every device you sign in on.
//
// Writes go to the local store first and into a pending queue. The queue
// drains whenever we are online and signed in, so logging a set on a phone
// with no reception is not lost.
//
// If the Supabase environment variables are absent the whole layer disables
// itself and the app runs exactly as it did before, on this device only.
// ============================================================

import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(URL && ANON);

export const supabase = configured
  ? createClient(URL, ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// ---- auth ---------------------------------------------------

export async function currentSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

// A magic link, so there is no password to lose. The link returns here.
export async function signInWithEmail(email) {
  if (!supabase) return { error: new Error("Sync is not configured.") };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export function onAuthChange(fn) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => fn(session));
  return () => data.subscription.unsubscribe();
}

// ---- pending queue -----------------------------------------
// One entry per metric per day, keyed so a repeated edit of the same cell
// replaces rather than stacks.

const QUEUE_KEY = "tcc:queue:v1";

const readQueue = () => {
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "{}");
  } catch (err) {
    return {};
  }
};

const writeQueue = (q) => {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch (err) {
    /* storage full or blocked; the local store still holds the value */
  }
};

export const pendingCount = () => Object.keys(readQueue()).length;

export function queueEntry(date, metricId, value) {
  const q = readQueue();
  q[date + "|" + metricId] = { date, metricId, value, at: Date.now() };
  writeQueue(q);
}

export function queueConfig(config) {
  const q = readQueue();
  q["__config"] = { config, at: Date.now() };
  writeQueue(q);
}

// ---- push ---------------------------------------------------

async function pushEntry(userId, date, metricId, value) {
  if (value == null) {
    return supabase.from("entries").delete()
      .eq("user_id", userId).eq("entry_date", date).eq("metric_id", metricId);
  }
  return supabase.from("entries").upsert(
    { user_id: userId, entry_date: date, metric_id: metricId, value, updated_at: new Date().toISOString() },
    { onConflict: "user_id,entry_date,metric_id" },
  );
}

async function pushConfig(userId, config) {
  return supabase.from("configs").upsert(
    { user_id: userId, config, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
}

// Drains the queue. Anything that fails stays queued for the next attempt.
export async function flush(userId) {
  if (!supabase || !userId) return { sent: 0, left: pendingCount() };
  const q = readQueue();
  const keys = Object.keys(q);
  let sent = 0;

  for (const key of keys) {
    const item = q[key];
    try {
      const { error } = key === "__config"
        ? await pushConfig(userId, item.config)
        : await pushEntry(userId, item.date, item.metricId, item.value);
      if (error) continue;
      const now = readQueue();
      // Only clear if it has not been rewritten by a newer edit while in flight.
      if (now[key] && now[key].at === item.at) {
        delete now[key];
        writeQueue(now);
      }
      sent += 1;
    } catch (err) {
      /* offline; leave it queued */
    }
  }
  return { sent, left: pendingCount() };
}

// ---- pull ---------------------------------------------------
// Returns whatever the server holds. Callers merge, rather than this deciding.

export async function pullAll(userId) {
  if (!supabase || !userId) return null;

  const [entriesRes, configRes] = await Promise.all([
    supabase.from("entries").select("entry_date, metric_id, value").eq("user_id", userId),
    supabase.from("configs").select("config").eq("user_id", userId).maybeSingle(),
  ]);

  if (entriesRes.error) return null;

  const entries = {};
  for (const row of entriesRes.data || []) {
    const day = entries[row.entry_date] || (entries[row.entry_date] = {});
    day[row.metric_id] = Number(row.value);
  }

  return {
    entries,
    config: configRes && !configRes.error && configRes.data ? configRes.data.config : null,
  };
}

// Remote is the base, local pending edits win over it, because those are the
// ones this device made and has not managed to send yet.
export function mergeEntries(remote, queue) {
  const out = {};
  for (const date of Object.keys(remote)) out[date] = { ...remote[date] };
  for (const key of Object.keys(queue)) {
    if (key === "__config") continue;
    const { date, metricId, value } = queue[key];
    if (value == null) {
      if (out[date]) delete out[date][metricId];
    } else {
      (out[date] || (out[date] = {}))[metricId] = value;
    }
  }
  for (const date of Object.keys(out)) {
    if (!Object.keys(out[date]).length) delete out[date];
  }
  return out;
}

export const readQueueRaw = readQueue;
