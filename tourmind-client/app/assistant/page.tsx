"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { chatAssistant } from "@/lib/api";
import { ChatAssistantResponse } from "@/lib/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

type StoredSession = {
  id: string;
  title: string;
  conversationId: string;
  messages: ChatMessage[];
  latestIntent: string;
  latestData: ChatAssistantResponse["data"] | null;
  createdAt: string;
  updatedAt: string;
};

type PinnedInsight = {
  id: string;
  pinnedAt: string;
  intent: string;
  label: string;
  data: ChatAssistantResponse["data"];
};

const SESSIONS_KEY = "tourmind.assistant.sessions.v2";
const PINNED_KEY = "tourmind.assistant.pins.v1";
const MAX_SESSIONS = 8;
const MAX_PINS = 10;

const QUICK_PROMPTS = [
  "Plan 2-day trip in Vizag under INR 3000",
  "Recommend hidden gems in Rajasthan",
  "Estimate budget for 4-day Goa family trip",
  "Suggest route order for Delhi Agra Jaipur",
  "Give me an offbeat monsoon itinerary in Kerala"
];

const FOLLOW_UP_PROMPTS: Record<string, string[]> = {
  trip_plan: [
    "Optimize this itinerary for less travel time",
    "Make this plan more budget-friendly",
    "Add food-focused places to this trip"
  ],
  budget: [
    "Split this budget into low, medium and high options",
    "Reduce this budget by 20 percent",
    "Include train-first transport strategy"
  ],
  recommend: [
    "Filter recommendations for nature lovers",
    "Recommend less crowded alternatives",
    "Create a weekend plan with these places"
  ],
  route: [
    "Add rest stops every 3 hours",
    "Suggest fuel-efficient driving sequence",
    "Convert this into a two-day drive plan"
  ],
  general: [
    "Plan a 3-day cultural trip in Hyderabad",
    "Suggest scenic road trips from Bengaluru",
    "Create a low-budget friends trip in Goa"
  ]
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createMessage = (role: "user" | "assistant", text: string): ChatMessage => ({
  id: createId(),
  role,
  text,
  createdAt: new Date().toISOString()
});

const deriveSessionTitle = (messages: ChatMessage[]) => {
  const firstUser = messages.find(message => message.role === "user");
  if (!firstUser) {
    return "New Session";
  }

  const trimmed = firstUser.text.trim();
  return trimmed.length > 44 ? `${trimmed.slice(0, 44)}...` : trimmed;
};

const createEmptySession = (): StoredSession => {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title: "New Session",
    conversationId: "",
    messages: [],
    latestIntent: "general",
    latestData: null,
    createdAt: now,
    updatedAt: now
  };
};

const toTimeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

const buildInsightLabel = (intent: string, data: ChatAssistantResponse["data"]) => {
  if (data.type === "trip_plan" && data.trip) {
    return `Trip plan: INR ${currencyFormatter.format(data.trip.budgetEstimate.total)}`;
  }

  if (data.type === "budget" && data.budget) {
    return `Budget: INR ${currencyFormatter.format(data.budget.total)}`;
  }

  if (data.type === "recommendations" && data.recommendations) {
    return `Recommendations: ${data.recommendations.length} places`;
  }

  return `Insight (${intent})`;
};

const formatCurrency = (value: number) => `INR ${currencyFormatter.format(Math.round(Number(value) || 0))}`;

export default function AssistantPage() {
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");

  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [latestIntent, setLatestIntent] = useState("general");
  const [latestData, setLatestData] = useState<ChatAssistantResponse["data"] | null>(null);

  const [input, setInput] = useState("Plan 2-day trip in Vizag under INR 3000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [pinnedInsights, setPinnedInsights] = useState<PinnedInsight[]>([]);

  const [builderLocation, setBuilderLocation] = useState("Andaman");
  const [builderDays, setBuilderDays] = useState(3);
  const [builderBudget, setBuilderBudget] = useState("INR 12000");
  const [builderStyle, setBuilderStyle] = useState("friends");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const rawSessions = window.localStorage.getItem(SESSIONS_KEY);
      const parsedSessions = rawSessions ? (JSON.parse(rawSessions) as StoredSession[]) : [];

      const normalizedSessions = Array.isArray(parsedSessions)
        ? parsedSessions.filter(item => item && Array.isArray(item.messages)).slice(0, MAX_SESSIONS)
        : [];

      const firstSession = normalizedSessions[0] || createEmptySession();

      setSessions(normalizedSessions.length > 0 ? normalizedSessions : [firstSession]);
      setActiveSessionId(firstSession.id);
      setConversationId(firstSession.conversationId || "");
      setMessages(firstSession.messages || []);
      setLatestIntent(firstSession.latestIntent || "general");
      setLatestData(firstSession.latestData || null);

      const rawPins = window.localStorage.getItem(PINNED_KEY);
      const parsedPins = rawPins ? (JSON.parse(rawPins) as PinnedInsight[]) : [];
      setPinnedInsights(Array.isArray(parsedPins) ? parsedPins.slice(0, MAX_PINS) : []);
    } catch (_error) {
      const fallback = createEmptySession();
      setSessions([fallback]);
      setActiveSessionId(fallback.id);
      setConversationId("");
      setMessages([]);
      setLatestIntent("general");
      setLatestData(null);
      setPinnedInsights([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !activeSessionId) {
      return;
    }

    setSessions(previous => {
      const existing = previous.find(session => session.id === activeSessionId);
      const now = new Date().toISOString();
      const updated: StoredSession = {
        id: activeSessionId,
        title: deriveSessionTitle(messages),
        conversationId,
        messages,
        latestIntent,
        latestData,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };

      const next = [updated, ...previous.filter(session => session.id !== activeSessionId)]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, MAX_SESSIONS);

      window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, [activeSessionId, conversationId, hydrated, latestData, latestIntent, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const followUps = useMemo(() => FOLLOW_UP_PROMPTS[latestIntent] || FOLLOW_UP_PROMPTS.general, [latestIntent]);

  const composerPrompt = useMemo(
    () => `Plan a ${builderDays}-day ${builderStyle} trip in ${builderLocation} under ${builderBudget}. Include route logic and budget split.`,
    [builderBudget, builderDays, builderLocation, builderStyle]
  );

  const latestTrip = latestData?.type === "trip_plan" ? latestData.trip : null;
  const latestBudget = latestData?.type === "budget" ? latestData.budget : null;
  const latestRecommendations = latestData?.type === "recommendations" ? latestData.recommendations : null;

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find(item => item.role === "assistant")?.text || "",
    [messages]
  );

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(successMessage);
      setError("");
    } catch (_error) {
      setError("Unable to copy right now.");
    }
  };

  const askAssistant = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || loading) {
      return;
    }

    const userMessage = createMessage("user", question);

    try {
      setLoading(true);
      setError("");
      setNotice("");
      setMessages(previous => [...previous, userMessage]);
      setInput("");

      const response = await chatAssistant({
        conversationId: conversationId || undefined,
        message: question
      });

      setConversationId(response.conversationId);
      setMessages(previous => [...previous, createMessage("assistant", response.reply)]);
      setLatestIntent(response.intent || "general");
      setLatestData(response.data || null);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Unable to reach assistant.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await askAssistant(input);
  };

  const startNewSession = () => {
    const session = createEmptySession();
    const next = [session, ...sessions.filter(item => item.id !== session.id)].slice(0, MAX_SESSIONS);

    setSessions(next);
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));

    setActiveSessionId(session.id);
    setConversationId("");
    setMessages([]);
    setLatestIntent("general");
    setLatestData(null);
    setInput("");
    setError("");
    setNotice("Started a new assistant session.");
  };

  const openSession = (session: StoredSession) => {
    setActiveSessionId(session.id);
    setConversationId(session.conversationId || "");
    setMessages(session.messages || []);
    setLatestIntent(session.latestIntent || "general");
    setLatestData(session.latestData || null);
    setError("");
    setNotice(`Loaded session: ${session.title}`);
  };

  const deleteSession = (sessionId: string) => {
    const remaining = sessions.filter(session => session.id !== sessionId);

    if (remaining.length === 0) {
      const fallback = createEmptySession();
      setSessions([fallback]);
      window.localStorage.setItem(SESSIONS_KEY, JSON.stringify([fallback]));
      setActiveSessionId(fallback.id);
      setConversationId("");
      setMessages([]);
      setLatestIntent("general");
      setLatestData(null);
      return;
    }

    setSessions(remaining);
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(remaining));

    if (activeSessionId === sessionId) {
      openSession(remaining[0]);
    }
  };

  const exportTranscript = async () => {
    if (messages.length === 0) {
      return;
    }

    const transcript = messages
      .map(message => `[${toTimeLabel(message.createdAt)}] ${message.role.toUpperCase()}: ${message.text}`)
      .join("\n\n");

    await copyText(transcript, "Transcript copied.");
  };

  const pinLatestInsight = () => {
    if (!latestData) {
      setError("No structured insight available to pin yet.");
      return;
    }

    const entry: PinnedInsight = {
      id: createId(),
      pinnedAt: new Date().toISOString(),
      intent: latestIntent,
      label: buildInsightLabel(latestIntent, latestData),
      data: latestData
    };

    const next = [entry, ...pinnedInsights].slice(0, MAX_PINS);
    setPinnedInsights(next);
    window.localStorage.setItem(PINNED_KEY, JSON.stringify(next));
    setNotice("Pinned latest insight.");
  };

  const removePinnedInsight = (id: string) => {
    const next = pinnedInsights.filter(item => item.id !== id);
    setPinnedInsights(next);
    window.localStorage.setItem(PINNED_KEY, JSON.stringify(next));
  };

  return (
    <div className="w-full space-y-6 px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
      <section className="relative overflow-hidden rounded-[28px] border border-base/10 bg-white/85 p-6 shadow-soft sm:p-8">
        <div className="pointer-events-none absolute -left-16 top-4 h-48 w-48 rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-0 h-52 w-52 rounded-full bg-highlight/25 blur-3xl" />
        <p className="text-xs uppercase tracking-[0.18em] text-base/55">AI Assistant Studio</p>
        <h1 className="mt-2 max-w-3xl font-[var(--font-lora)] text-3xl font-semibold text-base sm:text-4xl">
          Conversational planning with memory, insight cards, and follow-up workflows
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-base/75 sm:text-base">
          Use quick prompts, prompt composer, and pinned insights to turn one-off chats into reusable travel strategy sessions.
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <section className="space-y-5">
          <article className="rounded-2xl border border-base/15 bg-white/85 p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-base">Quick Commands</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startNewSession}
                  className="rounded-xl border border-base/20 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-base hover:border-accent hover:text-accent"
                >
                  New Session
                </button>
                <button
                  type="button"
                  onClick={exportTranscript}
                  className="rounded-xl border border-base/20 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-base hover:border-accent hover:text-accent"
                >
                  Copy Transcript
                </button>
                <button
                  type="button"
                  onClick={pinLatestInsight}
                  className="rounded-xl border border-base/20 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-base hover:border-accent hover:text-accent"
                >
                  Pin Insight
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => askAssistant(prompt)}
                  className="rounded-full border border-base/20 bg-panel/40 px-3 py-1.5 text-xs font-semibold text-base hover:border-accent hover:text-accent"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-base/15 bg-white/85 p-5 shadow-soft">
            <h2 className="text-lg font-semibold text-base">Prompt Composer</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                value={builderLocation}
                onChange={event => setBuilderLocation(event.target.value)}
                placeholder="Location"
                className="rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
              />
              <input
                type="number"
                min={1}
                max={12}
                value={builderDays}
                onChange={event => setBuilderDays(Number(event.target.value))}
                className="rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
              />
              <input
                value={builderBudget}
                onChange={event => setBuilderBudget(event.target.value)}
                placeholder="Budget"
                className="rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
              />
              <select
                value={builderStyle}
                onChange={event => setBuilderStyle(event.target.value)}
                className="rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
              >
                <option value="solo">Solo</option>
                <option value="friends">Friends</option>
                <option value="family">Family</option>
              </select>
            </div>
            <p className="mt-3 rounded-xl border border-base/10 bg-panel/35 px-3 py-2 text-sm text-base/80">{composerPrompt}</p>
            <button
              type="button"
              onClick={() => askAssistant(composerPrompt)}
              className="mt-3 rounded-xl bg-base px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent"
            >
              Ask With Composer
            </button>
          </article>

          <article className="rounded-2xl border border-base/15 bg-white/85 p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-base">Conversation</h2>
              <p className="text-xs uppercase tracking-[0.12em] text-base/55">{latestIntent.replace("_", " ")}</p>
            </div>

            <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <p className="rounded-xl border border-dashed border-base/25 px-4 py-4 text-sm text-base/70">
                  Start a conversation to get plans, route strategy, recommendations, and budget insights.
                </p>
              ) : (
                messages.map(message => (
                  <div
                    key={message.id}
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      message.role === "user"
                        ? "ml-auto max-w-[88%] bg-base text-white"
                        : "max-w-[92%] border border-base/15 bg-white text-base"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      {message.role === "assistant" && (
                        <button
                          type="button"
                          onClick={() => copyText(message.text, "Assistant reply copied.")}
                          className="rounded-md border border-base/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-base/70 hover:border-accent hover:text-accent"
                        >
                          Copy
                        </button>
                      )}
                    </div>
                    <p className={`mt-2 text-[11px] ${message.role === "user" ? "text-white/75" : "text-base/55"}`}>{toTimeLabel(message.createdAt)}</p>
                  </div>
                ))
              )}

              {loading && (
                <div className="max-w-[65%] rounded-2xl border border-base/15 bg-white px-4 py-3 text-sm text-base/70">
                  Assistant is thinking...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {followUps.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => askAssistant(prompt)}
                  className="rounded-full border border-base/20 bg-white px-3 py-1.5 text-xs font-semibold text-base hover:border-accent hover:text-accent"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="Ask TourMind AI..."
                className="w-full rounded-xl border border-base/20 px-4 py-2.5 text-sm outline-none ring-accent focus:ring-2"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-base px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Thinking..." : "Send"}
              </button>
            </form>

            {error && <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            {notice && <p className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
          </article>
        </section>

        <aside className="space-y-5 xl:sticky xl:top-28 xl:self-start">
          <article className="rounded-2xl border border-base/15 bg-white/85 p-5 shadow-soft">
            <h2 className="text-lg font-semibold text-base">Session Library</h2>
            {!hydrated ? (
              <p className="mt-3 text-sm text-base/70">Loading sessions...</p>
            ) : (
              <div className="mt-3 space-y-2">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    className={`rounded-xl border p-3 ${
                      session.id === activeSessionId ? "border-accent bg-accent/5" : "border-base/15 bg-white"
                    }`}
                  >
                    <button type="button" onClick={() => openSession(session)} className="w-full text-left">
                      <p className="text-sm font-semibold text-base">{session.title || "New Session"}</p>
                      <p className="mt-1 text-xs text-base/60">{new Date(session.updatedAt).toLocaleString()}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSession(session.id)}
                      className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-base/50 hover:text-rose-700"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-base/15 bg-white/85 p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-base">Insight Board</h2>
              <p className="text-[11px] uppercase tracking-[0.1em] text-base/55">Structured View</p>
            </div>

            {latestTrip && (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-base/15 bg-panel/35 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-base/60">Trip Snapshot</p>
                  <p className="mt-1 text-sm text-base/85">{latestTrip.itinerary.summary}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-base/15 bg-white px-2 py-1.5">
                      <p className="text-base/55">Total Budget</p>
                      <p className="font-semibold text-base">{formatCurrency(latestTrip.budgetEstimate.total)}</p>
                    </div>
                    <div className="rounded-lg border border-base/15 bg-white px-2 py-1.5">
                      <p className="text-base/55">Daily Avg</p>
                      <p className="font-semibold text-base">{formatCurrency(latestTrip.budgetEstimate.dailyAverage)}</p>
                    </div>
                    <div className="rounded-lg border border-base/15 bg-white px-2 py-1.5">
                      <p className="text-base/55">Distance</p>
                      <p className="font-semibold text-base">{latestTrip.optimizedRoute.totalDistanceKm} km</p>
                    </div>
                    <div className="rounded-lg border border-base/15 bg-white px-2 py-1.5">
                      <p className="text-base/55">Travel Time</p>
                      <p className="font-semibold text-base">{latestTrip.optimizedRoute.totalTravelTimeHours} h</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-base/15 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-base/60">Day-wise Plan</p>
                  <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                    {latestTrip.itinerary.days.map(day => (
                      <div key={day.day} className="rounded-lg border border-base/10 bg-panel/20 p-2.5 text-xs text-base/80">
                        <p className="font-semibold text-base">Day {day.day}: {day.title}</p>
                        <p className="mt-1">Morning: {day.timeSlots.morning}</p>
                        <p>Afternoon: {day.timeSlots.afternoon}</p>
                        <p>Evening: {day.timeSlots.evening}</p>
                        <p className="mt-1 font-medium text-accent">{formatCurrency(day.estimatedCost.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-base/15 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-base/60">Top Route Order</p>
                  <ol className="mt-2 space-y-1 text-xs text-base/80">
                    {latestTrip.optimizedRoute.orderedPlaces.slice(0, 6).map((place, index) => (
                      <li key={`${place.id}-${index}`}>
                        {index + 1}. {place.name} ({place.category})
                      </li>
                    ))}
                  </ol>
                </div>

                {latestTrip.hiddenGems.length > 0 && (
                  <div className="rounded-xl border border-base/15 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-base/60">Hidden Gems</p>
                    <div className="mt-2 space-y-1 text-xs text-base/80">
                      {latestTrip.hiddenGems.slice(0, 3).map(group => (
                        <p key={group.anchorPlaceId}>
                          Near {group.anchorPlaceName}: {group.gems.slice(0, 3).map(gem => gem.name).join(', ') || 'No gems found'}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {!latestTrip.validation.isRealistic && latestTrip.validation.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold">Plan Warnings</p>
                    <ul className="mt-1 space-y-1">
                      {latestTrip.validation.warnings.map(item => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {latestBudget && (
              <div className="mt-3 space-y-2 rounded-xl border border-base/15 bg-panel/35 p-3 text-sm">
                {latestIntent === "trip_plan" && (
                  <p className="rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
                    Showing detailed fallback blueprint while full trip generation is processing.
                  </p>
                )}
                <p className="font-semibold text-base">Budget Breakdown</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <p>Total: {formatCurrency(latestBudget.total)}</p>
                  <p>Daily: {formatCurrency(latestBudget.dailyAverage)}</p>
                  <p>Transport: {formatCurrency(latestBudget.breakdown.transport)}</p>
                  <p>Stay: {formatCurrency(latestBudget.breakdown.accommodation)}</p>
                  <p>Food: {formatCurrency(latestBudget.breakdown.food)}</p>
                  <p>Misc: {formatCurrency(latestBudget.breakdown.misc)}</p>
                </div>
                <div className="pt-1 text-xs text-base/70">
                  {latestBudget.notes.slice(0, 3).map(note => (
                    <p key={note}>- {note}</p>
                  ))}
                </div>
              </div>
            )}

            {latestRecommendations && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-base/60">Recommendation Cards</p>
                {latestRecommendations.slice(0, 6).map(place => (
                  <div key={place.id} className="rounded-xl border border-base/15 bg-white p-3 text-sm">
                    <p className="font-semibold text-base">{place.name}</p>
                    <p className="text-xs text-base/65">
                      {place.category} | {place.stateName}
                    </p>
                    <p className="mt-1 text-[11px] text-base/60">Cost: {place.estimatedCostRange || "medium"}</p>
                  </div>
                ))}
              </div>
            )}

            {!latestData && latestAssistantMessage && (
              <div className="mt-3 rounded-xl border border-base/15 bg-white p-3 text-xs text-base/75">
                <p className="font-semibold text-base">Latest Assistant Summary</p>
                <p className="mt-1 whitespace-pre-wrap">{latestAssistantMessage.slice(0, 420)}{latestAssistantMessage.length > 420 ? "..." : ""}</p>
              </div>
            )}

            {!latestData && !latestAssistantMessage && (
              <p className="mt-3 text-sm text-base/70">Structured results will appear here after your first request.</p>
            )}
          </article>

          <article className="rounded-2xl border border-base/15 bg-white/85 p-5 shadow-soft">
            <h2 className="text-lg font-semibold text-base">Pinned Insights</h2>
            {pinnedInsights.length === 0 ? (
              <p className="mt-3 text-sm text-base/70">Pin insights to build your reusable planning board.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {pinnedInsights.map(pin => (
                  <div key={pin.id} className="rounded-xl border border-base/15 bg-white p-3">
                    <p className="text-sm font-semibold text-base">{pin.label}</p>
                    <p className="mt-1 text-xs text-base/60">{new Date(pin.pinnedAt).toLocaleString()}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(JSON.stringify(pin.data, null, 2), "Pinned insight copied.")}
                        className="rounded-md border border-base/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-base/70 hover:border-accent hover:text-accent"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => removePinnedInsight(pin.id)}
                        className="rounded-md border border-base/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-base/70 hover:border-rose-300 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </aside>
      </div>
    </div>
  );
}


