import { supabase } from "./supabase";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createRoomCode(length = 6) {
  const values = new Uint32Array(length);
  window.crypto.getRandomValues(values);
  return Array.from(values, v => ALPHABET[v % ALPHABET.length]).join("");
}

export function normalizeRoomCode(code = "") {
  return code.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
}

export function getClientId() {
  const key = "wp-client-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export async function deleteRoom(roomCode) {
  return supabase.from("rooms").delete().eq("roomCode", normalizeRoomCode(roomCode));
}

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function getCurrentTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
