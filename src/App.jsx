import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import HomeView from "./pages/HomeView";
import CreateRoomView from "./pages/CreateRoomView";
import JoinRoomView from "./pages/JoinRoomView";
import RoomView from "./pages/RoomView";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" theme="dark" richColors />
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="/create" element={<CreateRoomView />} />
        <Route path="/join" element={<JoinRoomView />} />
        <Route path="/room/:roomCode" element={<RoomView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
