import React from "react";
import { Link } from "react-router-dom";
import { Users, Zap, Shield, Wifi, MessageSquare } from "lucide-react";

export default function HomeView() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Hero */}
      <div className="flex flex-col items-center justify-center flex-1 px-6 py-20 text-center relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
          />
        </div>

        {/* Logo */}
        <div className="relative mb-8 flex items-center gap-3.5">
          <img
            src="/favicon.svg"
            alt="WatchParty Logo"
            className="w-14 h-14 rounded-2xl shadow-2xl transition-transform hover:scale-105"
            style={{ boxShadow: "0 0 35px rgba(124,111,234,0.45)" }}
          />
          <span className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
            watch<span style={{ color: "var(--accent)" }}>party</span>
          </span>
        </div>

        <h1 className="font-display text-3xl sm:text-5xl font-bold text-white mb-4 max-w-xl leading-tight">
          Watch together, <span style={{ color: "var(--cyan)" }}>perfectly in sync</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-md mb-12 leading-relaxed">
          Create a room, share the code, and stream any video to friends — synchronized in real-time via WebSockets.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link to="/create" className="btn-primary px-8 py-4 text-base">
            <Zap className="h-5 w-5" />
            Create a Room
          </Link>
          <Link
            to="/join"
            className="btn-ghost px-8 py-4 text-base font-semibold"
            style={{ borderColor: "var(--border-bright)" }}
          >
            <Users className="h-5 w-5" />
            Join with Code
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 mt-16">
          {[
            { icon: Wifi, label: "Real-time sync via WebSockets" },
            { icon: MessageSquare, label: "Live group chat" },
            { icon: Shield, label: "No sign-up needed" },
            { icon: Users, label: "Auto-cleanup when host leaves" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="tag flex items-center gap-2">
              <Icon className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
