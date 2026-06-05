# Screen 1

## Overview

`Screen 1` is a modern React + TypeScript media gallery demo with a companion Express backend. It demonstrates an event-driven interface for browsing, uploading, and discovering media using role-based access, local persistence, image uploads, and face matching features.

The project is designed as a self-contained full-stack prototype with:
- A Vite-powered React frontend written in TypeScript
- Reusable UI primitives and responsive layouts
- An Express backend API for authentication, media management, and notifications
- Local file storage for uploaded media and generated selfies
- Face matching support via Python integration

## Key features

- Role-based authentication for `admin`, `photographer`, `member`, and `viewer`
- Event discovery, album browsing, and search across media
- File upload workflow with drag-and-drop and preview support
- Notifications and activity stream for user interactions
- Local backend data persistence in `server/data.json`
- Static file serving for image uploads under `server/uploads`

## Tech stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- shadcn UI components
- Express
- JWT authentication
- Multer file uploads
- Jimp image processing
- Python face matching script

## Prerequisites

- Node.js 20+ recommended
- npm 10+ or compatible package manager
- Python 3.x installed and available on `PATH` for face matching

## Install

```bash
npm install
npm run setup
```

## Development

Start the backend server:

```bash
npm run server
```

Start the frontend development server:

```bash
npm run dev
```

Run both concurrently:

```bash
npm run dev:all
```

By default, the frontend runs at `http://localhost:5173` and the backend API runs at `http://localhost:4000`.

## Available scripts

- `npm run dev` - Start the frontend Vite development server
- `npm run server` - Start the Express backend API server
- `npm run dev:all` - Run both frontend and backend together
- `npm run build` - Build the production frontend assets
- `npm run lint` - Run ESLint for code quality checks

## Backend API

The backend exposes REST endpoints under `/api`, including:

- `POST /api/auth/login` - authenticate users and return a JWT
- `GET /api/events` - fetch event listings
- `GET /api/media` - fetch media items and albums
- `POST /api/upload` - upload images and process face matching
- `GET /api/notifications` - fetch user notifications

## Authentication

The app supports four demo roles with predefined credentials:

- `admin` / `admin123`
- `photographer` / `photographer123`
- `member` / `member123`
- `viewer` / `viewer123`

The `viewer` role is used for public browsing and does not require a backend token.

## Storage and persistence

Uploaded files and generated selfies are stored locally in:

- `server/uploads`
- `server/uploads/selfies`

The application also persists event, media, and notification data to:

- `server/data.json`

This is a demo implementation and is intended for local development only.

## Notes

- If AWS integration is not configured, the app uses local storage for uploads.
- The backend is configured to allow requests from `http://localhost:5173`.
- Ensure Python is installed on your machine if you want face matching to work.

## Recommended next steps

- Add production-ready storage for uploaded media (S3, Azure Blob, etc.)
- Replace local JSON persistence with a database
- Harden authentication and role permissions
- Add end-to-end tests for frontend and backend flows
- Improve error handling and user feedback for file uploads
