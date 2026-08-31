# BitEat — Mobile (React Native / Expo)

Native iOS/Android client for the BitEat restaurant system. It talks to the same
Express API that lives in [`../api`](../api) — no separate backend.

## Feature parity with the web app (`../f`)

| Role              | Screens                                                             |
| ----------------- | ------------------------------------------------------------------- |
| Kamarier (waiter) | **Krijo** (POS / new order), **Porosite** (my open tables + pay), **Rezervime** |
| Admin / Menaxher  | **Dashboard** (xhiro / produktet / inventari), **Porosite** (history), **Statistika**, **Rezervime** |

Login persists across app restarts (AsyncStorage).

## Prerequisites

- Node 18+
- The BitEat API running and reachable (see [`../README.md`](../README.md))
- [Expo Go](https://expo.dev/go) on your phone, or an Android/iOS emulator

## Setup

```bash
cd mobile
npm install
# align native package versions with the installed Expo SDK
npx expo install --fix
```

## Point the app at your API

Create `mobile/.env` (copied from `.env.example`):

```bash
cp .env.example .env
```

| Where the app runs | `EXPO_PUBLIC_API_URL`                     |
| ------------------ | ---------------------------------------- |
| Android emulator   | `http://10.0.2.2:5000`                   |
| iOS simulator      | `http://localhost:5000`                  |
| Physical phone     | `http://<your-computer-LAN-IP>:5000`     |
| Deployed backend   | `https://<your-deployment>.vercel.app`   |

`app.json` → `expo.extra.apiUrl` is the fallback when no env var is set.

## Run

```bash
npm start          # Expo dev server + QR code
npm run android    # open on Android emulator
npm run ios        # open on iOS simulator (macOS)
```

## Project layout

```
mobile/
├── App.js                     # providers + navigator
├── src/
│   ├── api/client.js          # typed wrapper over every /api/* endpoint
│   ├── context/AuthContext.js # login/logout + persisted session
│   ├── hooks/useApi.js        # fetch + pull-to-refresh helper
│   ├── theme/index.js         # colours / spacing / typography tokens
│   ├── components/            # Screen, Card, Button, Field, Bar, sheets…
│   ├── navigation/            # role-based bottom tabs
│   └── screens/               # Login, POS, Orders, Dashboard, Statistika, Reservations
```

## Notes

- The API sends CORS `*` and native apps don't enforce CORS, so no extra config.
- Passwords are sent as plain text to `/api/login` — same as the web app. Put the
  API behind HTTPS in production.
- Dates/times in the reservation form are plain text (`YYYY-MM-DD`, `HH:MM`). Swap
  in `@react-native-community/datetimepicker` later if you want native pickers.
