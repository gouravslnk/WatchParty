import { create } from "zustand";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

// ─── SOCKET STORE ─────────────────────────────────────────────────────────────
export const useSocketStore = create((set, get) => ({
  socket: null,
  connected: false,
  connecting: false,

  connect: () => {
    if (get().socket?.connected) return get().socket;
    set({ connecting: true });

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      secure: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("[Socket] Connected:", socket.id);
      set({ connected: true, connecting: false });
    });

    socket.on("disconnect", () => {
      console.log("[Socket] Disconnected");
      set({ connected: false });
    });

    set({ socket });
    return socket;
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false, connecting: false });
    }
  },
}));

// ─── USER STORE ───────────────────────────────────────────────────────────────
export const useUserStore = create((set) => ({
  username: "",
  isAdmin: false,
  setUsername: (username) => set({ username }),
  setIsAdmin: (isAdmin) => set({ isAdmin }),
  reset: () => set({ username: "", isAdmin: false }),
}));

// ─── CHAT STORE ───────────────────────────────────────────────────────────────
export const useChatStore = create((set) => ({
  messages: [],       // { id, type: "message"|"log"|"system", username, text, time }
  unreadCount: 0,
  chatOpen: true,

  addMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages.slice(-200), { id: Date.now() + Math.random(), ...msg, type: "message" }],
      unreadCount: s.chatOpen ? 0 : s.unreadCount + 1,
    })),

  addLog: (msg) =>
    set((s) => ({
      messages: [...s.messages.slice(-200), { id: Date.now() + Math.random(), ...msg, type: "log" }],
    })),

  addSystem: (text) =>
    set((s) => ({
      messages: [...s.messages.slice(-200), { id: Date.now() + Math.random(), type: "system", text, time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) }],
    })),

  clearMessages: () => set({ messages: [] }),
  setChatOpen: (open) => set({ chatOpen: open, unreadCount: open ? 0 : 0 }),
  markRead: () => set({ unreadCount: 0 }),
}));
