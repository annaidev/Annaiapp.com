# Annai - Travel Companion App

## Overview
A comprehensive travel companion app with user authentication. Each traveler has their own private account with trips, packing lists, budgets, documents, and itineraries. Features AI-powered safety tips, cultural advice, local phrases, weather forecasts, an interactive safety map, and destination hero images.

## Tech Stack
- **Frontend**: React + Vite, TailwindCSS, shadcn/ui, Wouter routing, TanStack Query, Framer Motion, Leaflet (maps)
- **Backend**: Express.js, Drizzle ORM, PostgreSQL, Passport.js (local strategy), express-session with connect-pg-simple
- **AI**: OpenAI direct API (OPENAI_API_KEY), model: gpt-4o-mini via aiChat() helper in server/routes.ts

## Authentication
- Passport.js with local strategy (username/password)
- Passwords hashed with scrypt
- Sessions stored in PostgreSQL via connect-pg-simple
- SESSION_SECRET env var for session signing
- All API routes protected with requireAuth middleware
- Trips scoped to userId — each user only sees their own data
- Frontend gates on /api/user check; unauthenticated users see AuthPage
- Password visibility toggle (eye icon) on login and registration forms
- Security question required during registration (stored lowercase for case-insensitive matching)
- Forgot password flow: enter username → answer security question → set new password
- API endpoints: POST /api/forgot-password/question, POST /api/forgot-password/reset

## Project Structure
- `shared/schema.ts` - Drizzle ORM schema (users, trips, packing_lists, budget_items, travel_documents, itinerary_items)
- `shared/routes.ts` - API contract definitions with Zod validation
- `server/auth.ts` - Passport.js auth setup, login/register/logout routes, requireAuth middleware
- `server/routes.ts` - Express API routes (CRUD + AI endpoints, all protected)
- `server/storage.ts` - Database storage interface
- `client/src/pages/` - AuthPage, Home, TripDashboard, PackingList, BudgetTracker, DocumentVault, ItineraryBuilder
- `client/src/components/` - NavBar (globe + airplane travel logo with "Annai" wordmark + user/logout), TripForm, SafetyMap
- `client/src/hooks/` - use-auth, use-trips, use-packing-lists, use-documents, use-ai

## Key Features
- User authentication (register/login/logout)
- Trip CRUD with citizenship field for embassy info (scoped per user)
- AI-powered packing list prefill on trip creation
- Smart packing suggestions
- Cultural customs & etiquette tips (AI)
- Safety advice with embassy/consulate info (AI)
- Local phrases with pronunciation guides (AI)
- Weather forecast for trip dates (AI)
- Interactive safety map with Leaflet (CARTO English tiles)
- Budget tracker with category breakdown and visual charts
- Travel document vault (flight, hotel, insurance, other — no passport storage)
- Day-by-day itinerary builder with time slots and categories
- Trip countdown badges on cards
- Destination hero images via Loremflickr
- Trip readiness dashboard (packing %, docs, expenses, days planned)
- Quick booking links (Airbnb, Google Flights, Booking.com, Uber)

## Color Scheme
Bright & cheerful: coral primary, teal secondary, golden accent, warm white background

## Pages & Routes
- `/` - Auth page (if not logged in) or Home (trip cards with hero images, countdowns)
- `/trips/:id` - Trip Dashboard (overview + destination info tabs)
- `/trips/:id/packing-list` - Packing List
- `/trips/:id/budget` - Budget Tracker
- `/trips/:id/documents` - Document Vault
- `/trips/:id/itinerary` - Itinerary Builder

## Running
`npm run dev` starts Express + Vite on port 5000
