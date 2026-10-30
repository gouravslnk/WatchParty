# WatchParty

WatchParty is a synchronized real-time video playback platform built on a client-server architecture. It enables distributed groups of users to stream and watch online videos simultaneously with sub-second synchronization, host-managed playback controls, live text chat, and participant presence tracking.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
  - [Playback Synchronization Model](#playback-synchronization-model)
  - [Real-Time Event Flow](#real-time-event-flow)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Database Schema](#database-schema)
- [Environment Configuration](#environment-configuration)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
  - [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
  - [Backend Deployment (Render)](#backend-deployment-render)
- [License](#license)

---

## Overview

WatchParty addresses the challenge of synchronized video viewing across disparate network environments. The system relies on a host-authoritative model where the room creator maintains sole control over media playback (play, pause, seek, and media switching). Viewers receive deterministic playback instructions through bidirectional WebSocket channels, with automatic drift correction and late-joiner state recovery.

Room metadata and persistence are managed through Supabase PostgreSQL, while all real-time interactions (playback commands, video switching, chat messages, and participant presence) are brokered directly by an event-driven Node.js Socket.IO server. This architecture eliminates persistent database connection overhead and allows the platform to operate efficiently within free-tier quotas.

---

## Key Features

- **Host-Authoritative Video Synchronization**:
  - The room creator retains exclusive control over playback commands (`play`, `pause`, `seek`).
  - Automatic 3-second heartbeat synchronization broadcasts ensure playback parity across all active viewers.
  - Client-side drift detection automatically resynchronizes clients if local playback deviates by more than 2 seconds.
  - Browser autoplay policy handling prompts users with an interactive unlock interface when unmuted playback is restricted.

- **Late-Joiner State Synchronization**:
  - Newly connected clients query the current room host for playback position and state upon joining.
  - Hosts dispatch targeted state responses via the server directly to the requesting socket, eliminating initial drift.

- **Room and Identity Management**:
  - Lightweight access model requiring no user registration or persistent credentials.
  - Unique 6-character alphanumeric room codes generated client-side with duplicate collision protection.
  - Direct invite link generation (`/join?roomCode=<CODE>`) with automated input prefill.
  - Automated room teardown: when the host explicitly leaves, the room record is purged from Supabase and all active viewers are transitioned back to the home view.

- **Multi-Format Video Streaming**:
  - Broad format compatibility through React Player and HLS.js, including HLS streams (`.m3u8`), standard MP4 sources, YouTube, and Vimeo links.
  - In-room video switching: hosts can switch the active media source dynamically during an ongoing session.

- **Interactive Collaboration**:
  - Low-latency group chat with automatic system notifications for user joins and departures.
  - Ephemeral reactions broadcast in real time across the room overlay.
  - Dynamic participant roster displaying active viewers and designating the host with administrative status.

---

## System Architecture

### Playback Synchronization Model

```
+-------------------------------------------------------------+
|                          HOST CLIENT                        |
|  Controls: Play / Pause / Seek / Change Video               |
|  Broadcasts: 3s Heartbeat Sync & Direct State Responses     |
+------------------------------+------------------------------+
                               |
                        WebSocket Event
                               |
                               v
+-------------------------------------------------------------+
|                     SOCKET.IO SERVER                        |
|  In-memory room registry, socket routing, presence tracking |
+------------------------------+------------------------------+
                               |
                        WebSocket Event
                               |
                               v
+-------------------------------------------------------------+
|                        VIEWER CLIENTS                       |
|  Receives remote commands -> Applies drift correction       |
+-------------------------------------------------------------+
```

### Real-Time Event Flow

1. **Room Creation**: The client generates a unique room code, persists the room entity to Supabase, and routes the host into the room interface.
2. **Socket Registration**: The host establishes a WebSocket connection and registers the room within the server's in-memory registry.
3. **Participant Onboarding**:
   - A participant inputs a display name and room code (or accesses via an invite link).
   - The client verifies room existence against Supabase.
   - Upon connection, the server registers the socket into the room channel and requests the active video state from the host socket.
   - The host sends the current timestamp and play status; the server relays this exclusively to the newly connected participant.
4. **Playback Command Dispatch**: When the host interacts with the player controls, an event is emitted to the server and broadcast to all room members excluding the host.
5. **Session Teardown**: An explicit exit by the host triggers an event that notifies all connected viewers, deletes the room record from Supabase, and clears the server memory cache.

---

## Technology Stack

### Frontend Client (`client`)
- **Framework**: React 18 (SPA)
- **Build Tool**: Vite
- **Styling**: Tailwind CSS, Vanilla CSS custom design tokens
- **Routing**: React Router DOM (v6) with Single-Page Application rewrites
- **State Management**: Zustand
- **Media Playback**: React Player, HLS.js, Plyr
- **Network & Real-Time**: Socket.io Client, Supabase JS SDK
- **Icons & UI Utilities**: Lucide React, Sonner (toast notifications)

### Backend Server (`server`)
- **Runtime**: Node.js (ES Modules)
- **Real-Time Engine**: Socket.IO
- **Database Client**: Supabase JS SDK
- **Environment Management**: Dotenv

### Database & Infrastructure
- **Database**: Supabase (PostgreSQL with Realtime change subscriptions)
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Render

---

## Repository Structure

```
WatchParty/
├── client/                     # Frontend Single Page Application
│   ├── public/                 # Static assets
│   ├── src/
│   │   ├── assets/             # Global stylesheets and assets
│   │   ├── components/         # Reusable UI components (VideoPlayer, Sidebar)
│   │   ├── lib/                # Supabase client, room utilities
│   │   ├── pages/              # Views (HomeView, CreateRoomView, JoinRoomView, RoomView)
│   │   ├── stores/             # Zustand state management stores
│   │   ├── App.jsx             # Route definitions
│   │   └── main.jsx            # React root entry point
│   ├── .env.example            # Client environment variable template
│   ├── index.html              # HTML entry document
│   ├── package.json            # Client dependencies and build scripts
│   ├── tailwind.config.js      # Tailwind CSS configuration
│   ├── vercel.json             # Vercel SPA routing rewrite rules
│   └── vite.config.js          # Vite configuration
├── server/                     # Backend real-time synchronization server
│   ├── index.js                # Socket.IO connection handling and room lifecycle
│   ├── .env.example            # Server environment variable template
│   └── package.json            # Server dependencies and lifecycle scripts
├── .gitignore                  # Global version control exclusions
├── package.json                # Monorepo workspaces definition and root scripts
└── README.md                   # Project documentation
```

---

## Database Schema

WatchParty requires a single table in your Supabase PostgreSQL instance:

```sql
create table public.rooms (
  id bigint generated by default as identity primary key,
  "roomCode" text not null unique,
  "roomName" text not null,
  "roomType" text default 'online',
  admin text not null,
  files jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.rooms enable row level security;

-- Allow public read and write access for active rooms
create policy "Allow public access to rooms"
  on public.rooms
  for all
  using (true)
  with check (true);
```

---

## Environment Configuration

### Client Environment (`client/.env`)

| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xyzproject.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous public API key | `eyJhbGciOi...` |
| `VITE_SOCKET_URL` | Backend Socket.IO server endpoint | `http://localhost:3001` (Dev) / `https://api.yourdomain.com` (Prod) |

### Server Environment (`server/.env`)

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Local server listener port | `3001` |
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xyzproject.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous API key | `eyJhbGciOi...` |

---

## Local Development

### Prerequisites

- Node.js (version 18 or higher recommended)
- npm (version 9 or higher)
- Active Supabase project with the schema configured above

### Installation

Clone the repository and install all dependencies across the monorepo:

```bash
# Clone the repository
git clone <repository-url>
cd WatchParty

# Install all workspace dependencies
npm run install:all
```

### Running the Application

1. Populate `client/.env` and `server/.env` based on their respective `.env.example` templates.
2. Start both services in separate terminal sessions:

```bash
# Terminal 1: Start frontend development server (http://localhost:5174)
npm run dev:client

# Terminal 2: Start backend Socket.IO server (http://localhost:3001)
npm run dev:server
```

---

## Production Deployment

### Frontend Deployment (Vercel)

1. Connect the `WatchParty` repository to a new Vercel project.
2. Configure the build settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Supply the production environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SOCKET_URL`).
4. Deploy the project. The included `client/vercel.json` ensures that all direct link access (such as `/join?roomCode=...`) correctly routes through `index.html` without yielding 404 responses.

### Backend Deployment (Render)

1. Create a new **Web Service** in Render and connect the `WatchParty` repository.
2. Configure service parameters:
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Configure environment variables (`PORT`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Deploy the service and record the generated service URL.
5. Update `VITE_SOCKET_URL` in the frontend Vercel deployment with the newly provisioned Render backend URL.

---

## License

This project is licensed under the MIT License.