# Annai - Travel Companion App

## Overview
A comprehensive travel companion app that helps users manage trips, plan travel via quick links, generate AI-powered packing lists, get cultural tips, safety advice, local phrases, weather forecasts, track budgets, store travel documents, and build day-by-day itineraries. Features an interactive Leaflet safety map and destination hero images.

## Tech Stack
- **Frontend**: React + Vite, TailwindCSS, shadcn/ui, Wouter routing, TanStack Query, Framer Motion, Leaflet (maps)
- **Backend**: Express.js, Drizzle ORM, PostgreSQL
- **AI**: OpenAI via Replit AI Integrations (env vars: AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL), model: gpt-5.1

## Project Structure
- `shared/schema.ts` - Drizzle ORM schema (trips, packing_lists, budget_items, travel_documents, itinerary_items)
- `shared/routes.ts` - API contract definitions with Zod validation
- `server/routes.ts` - Express API routes (CRUD + AI endpoints)
- `server/storage.ts` - Database storage interface
- `client/src/pages/` - Home, TripDashboard, PackingList, BudgetTracker, DocumentVault, ItineraryBuilder
- `client/src/components/` - NavBar (SVG logo), TripForm, SafetyMap
- `client/src/hooks/` - use-trips, use-packing-lists, use-documents, use-ai (cultural tips, safety, phrases, weather, safety map)

## Key Features
- Trip CRUD with citizenship field for embassy info
- AI-powered packing list prefill on trip creation
- Smart packing suggestions
- Cultural customs & etiquette tips (AI)
- Safety advice with embassy/consulate info (AI)
- Local phrases with pronunciation guides (AI)
- Weather forecast for trip dates (AI)
- Interactive safety map with Leaflet (CARTO English tiles)
- Budget tracker with category breakdown and visual charts
- Travel document vault with type grouping and quick-copy reference numbers
- Day-by-day itinerary builder with time slots and categories
- Trip countdown badges on cards ("X days to go", "Happening now!")
- Destination hero images via Unsplash
- Trip readiness dashboard (packing %, docs, expenses, days planned)
- Quick booking links (Airbnb, Google Flights, Booking.com, Uber)

## Color Scheme
Bright & cheerful: coral primary, teal secondary, golden accent, warm white background

## Pages & Routes
- `/` - Home (trip cards with hero images, countdowns)
- `/trips/:id` - Trip Dashboard (overview + AI tools tabs)
- `/trips/:id/packing-list` - Packing List
- `/trips/:id/budget` - Budget Tracker
- `/trips/:id/documents` - Document Vault
- `/trips/:id/itinerary` - Itinerary Builder

## Running
`npm run dev` starts Express + Vite on port 5000
