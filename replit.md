# Annai - Travel Companion App

## Overview
A comprehensive travel companion app that helps users manage trips, plan travel via quick links to Airbnb/Uber/Flights/Hotels, generate AI-powered packing lists, get cultural customs tips, receive safety advice (areas to avoid based on crime data), and visualize safety zones on an interactive map.

## Tech Stack
- **Frontend**: React + Vite, TailwindCSS, shadcn/ui, Wouter routing, TanStack Query, Framer Motion, Leaflet (maps)
- **Backend**: Express.js, Drizzle ORM, PostgreSQL
- **AI**: OpenAI via Replit AI Integrations (env vars: AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL), model: gpt-5.1

## Project Structure
- `shared/schema.ts` - Drizzle ORM schema (trips, packing_lists)
- `shared/routes.ts` - API contract definitions with Zod validation
- `server/routes.ts` - Express API routes (CRUD + AI endpoints)
- `server/storage.ts` - Database storage interface
- `client/src/pages/` - Home, TripDashboard, PackingList
- `client/src/components/` - NavBar, TripForm, SafetyMap
- `client/src/hooks/` - use-trips, use-packing-lists, use-ai

## Key Features
- Trip CRUD with citizenship field for embassy info
- AI-powered packing list prefill on trip creation
- Smart packing suggestions (on Packing List page)
- Cultural customs & etiquette tips
- Safety advice with embassy/consulate info
- Interactive safety map with Leaflet (safe/caution/avoid zones)
- Quick booking links (Airbnb, Google Flights, Booking.com, Uber)

## Color Scheme
Inspired by Annai logo: sky blue primary, green secondary, warm cream background, dark slate accents

## Running
`npm run dev` starts Express + Vite on port 5000
