import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AI_MODEL = "gpt-4o-mini";

async function aiChat(messages: { role: string; content: string }[], jsonMode = false): Promise<string> {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: messages as any,
    max_tokens: 4096,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  });
  return response.choices[0]?.message?.content || "";
}

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function extractJson(text: string): string {
  const cleaned = stripThinkTags(text);
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceMatch = cleaned.match(/(\{[\s\S]*\})/);
  if (braceMatch) return braceMatch[1].trim();
  return cleaned;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get(api.trips.list.path, requireAuth, async (req, res) => {
    const trips = await storage.getTrips(req.user!.id);
    res.json(trips);
  });

  app.get(api.trips.get.path, requireAuth, async (req, res) => {
    const trip = await storage.getTrip(Number(req.params.id));
    if (!trip || trip.userId !== req.user!.id) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    res.json(trip);
  });

  app.post(api.trips.create.path, requireAuth, async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.startDate && typeof body.startDate === 'string') body.startDate = new Date(body.startDate);
      if (body.endDate && typeof body.endDate === 'string') body.endDate = new Date(body.endDate);
      const input = api.trips.create.input.parse(body);
      const trip = await storage.createTrip({ ...input, userId: req.user!.id });
      
      try {
        const prompt = `Generate a concise essential packing list for a trip to ${trip.destination}. 
        Include location-specific essentials like universal adapters (if international/overseas from US/EU), 
        jackets/clothing based on typical weather, and must-have travel documents. 
        Return ONLY a JSON object with a single key 'items' containing an array of strings.`;
        
        const content = await aiChat([{ role: "user", content: prompt }]);
        if (content) {
          const { items } = JSON.parse(extractJson(content));
          if (Array.isArray(items)) {
            for (const item of items) {
              await storage.createPackingList({
                tripId: trip.id,
                item,
                isPacked: false
              });
            }
          }
        }
      } catch (aiError) {
        console.error("Failed to prefill packing list:", aiError);
      }

      res.status(201).json(trip);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.trips.update.path, requireAuth, async (req, res) => {
    try {
      const trip = await storage.getTrip(Number(req.params.id));
      if (!trip || trip.userId !== req.user!.id) {
        return res.status(404).json({ message: 'Trip not found' });
      }
      const body = { ...req.body };
      if (body.startDate && typeof body.startDate === 'string') body.startDate = new Date(body.startDate);
      if (body.endDate && typeof body.endDate === 'string') body.endDate = new Date(body.endDate);
      const input = api.trips.update.input.parse(body);
      const updated = await storage.updateTrip(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.trips.delete.path, requireAuth, async (req, res) => {
    const trip = await storage.getTrip(Number(req.params.id));
    if (!trip || trip.userId !== req.user!.id) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    await storage.deleteTrip(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.packingLists.listByTrip.path, requireAuth, async (req, res) => {
    const items = await storage.getPackingListsByTrip(Number(req.params.tripId));
    res.json(items);
  });

  app.post(api.packingLists.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.packingLists.create.input.parse(req.body);
      const item = await storage.createPackingList({
        ...input,
        tripId: Number(req.params.tripId)
      });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.packingLists.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.packingLists.update.input.parse(req.body);
      const item = await storage.updatePackingList(Number(req.params.id), input);
      if (!item) {
        return res.status(404).json({ message: 'Packing list item not found' });
      }
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.packingLists.delete.path, requireAuth, async (req, res) => {
    await storage.deletePackingList(Number(req.params.id));
    res.status(204).send();
  });

  app.post(api.ai.generatePackingList.path, requireAuth, async (req, res) => {
    try {
      const { destination, days } = api.ai.generatePackingList.input.parse(req.body);
      
      const prompt = `Generate a concise packing list for a trip to ${destination}${days ? ` for ${days} days` : ''}. Return ONLY a JSON object with a single key 'items' containing an array of strings. No explanation, no markdown, just the JSON.`;
      
      const content = await aiChat([{ role: "user", content: prompt }], true);
      if (!content) throw new Error("No response from AI");
      
      res.json(JSON.parse(content));
    } catch (error) {
      console.error("AI Packing List Error:", error);
      res.status(500).json({ message: "Failed to generate packing list" });
    }
  });

  app.post(api.ai.culturalTips.path, requireAuth, async (req, res) => {
    try {
      const { destination } = api.ai.culturalTips.input.parse(req.body);
      
      const raw = await aiChat([
        { role: "system", content: "You are a travel expert providing concise, actionable cultural customs and etiquette tips. Always respond in English. Format with markdown." },
        { role: "user", content: `Give me 3-5 important cultural customs, tips, and etiquette advice for visiting ${destination}. Respond entirely in English.` }
      ]);
      const tips = stripThinkTags(raw || "No tips available.");
      res.json({ tips });
    } catch (error) {
      console.error("AI Cultural Tips Error:", error);
      res.status(500).json({ message: "Failed to fetch cultural tips" });
    }
  });

  app.post(api.ai.safetyAdvice.path, requireAuth, async (req, res) => {
    try {
      const { destination, citizenship } = api.ai.safetyAdvice.input.parse(req.body);
      
      const raw = await aiChat([
        { role: "system", content: "You are a travel safety and diplomatic expert. Provide concise advice on areas to avoid, common scams, and general safety. ALSO, if provided with a citizenship, find and include the location and contact information for the nearest embassy or consulate of that country in the destination. Always respond in English. Format with clear markdown headings." },
        { role: "user", content: `What are the safety concerns and embassy information for a ${citizenship || "traveler"} visiting ${destination}? Respond entirely in English.` }
      ]);
      const advice = stripThinkTags(raw || "No safety advice available.");
      res.json({ advice });
    } catch (error) {
      console.error("AI Safety Advice Error:", error);
      res.status(500).json({ message: "Failed to fetch safety advice" });
    }
  });

  app.post(api.ai.safetyMap.path, requireAuth, async (req, res) => {
    try {
      const { destination } = api.ai.safetyMap.input.parse(req.body);

      const content = await aiChat([
        {
          role: "system",
          content: `You are a travel safety data analyst. Return a JSON object with:
1. "center": {"lat": number, "lng": number} — city center coordinates.
2. "zones": array of 6 areas, each with: "name" (string), "lat" (number), "lng" (number), "radius" (number, 300-1500 meters), "level" ("safe"|"caution"|"avoid"), "description" (one short sentence).
Include a mix of safe, caution, and avoid areas. Use real neighborhood names and accurate coordinates. All text in English. Return ONLY valid JSON.`
        },
        { role: "user", content: `Safety zone data for ${destination}.` }
      ], true);
      if (!content) throw new Error("No response from AI");

      res.json(JSON.parse(content));
    } catch (error) {
      console.error("AI Safety Map Error:", error);
      res.status(500).json({ message: "Failed to generate safety map data" });
    }
  });

  app.get(api.budgetItems.listByTrip.path, requireAuth, async (req, res) => {
    const items = await storage.getBudgetItemsByTrip(Number(req.params.tripId));
    res.json(items);
  });
  app.post(api.budgetItems.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.budgetItems.create.input.parse(req.body);
      const item = await storage.createBudgetItem({ ...input, tripId: Number(req.params.tripId) });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      throw err;
    }
  });
  app.put(api.budgetItems.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.budgetItems.update.input.parse(req.body);
      const item = await storage.updateBudgetItem(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });
  app.delete(api.budgetItems.delete.path, requireAuth, async (req, res) => {
    await storage.deleteBudgetItem(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.travelDocuments.listByTrip.path, requireAuth, async (req, res) => {
    const docs = await storage.getTravelDocumentsByTrip(Number(req.params.tripId));
    res.json(docs);
  });
  app.post(api.travelDocuments.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.travelDocuments.create.input.parse(req.body);
      const doc = await storage.createTravelDocument({ ...input, tripId: Number(req.params.tripId) });
      res.status(201).json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      throw err;
    }
  });
  app.put(api.travelDocuments.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.travelDocuments.update.input.parse(req.body);
      const doc = await storage.updateTravelDocument(Number(req.params.id), input);
      res.json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });
  app.delete(api.travelDocuments.delete.path, requireAuth, async (req, res) => {
    await storage.deleteTravelDocument(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.itineraryItems.listByTrip.path, requireAuth, async (req, res) => {
    const items = await storage.getItineraryItemsByTrip(Number(req.params.tripId));
    res.json(items);
  });
  app.post(api.itineraryItems.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.itineraryItems.create.input.parse(req.body);
      const item = await storage.createItineraryItem({ ...input, tripId: Number(req.params.tripId) });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      throw err;
    }
  });
  app.put(api.itineraryItems.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.itineraryItems.update.input.parse(req.body);
      const item = await storage.updateItineraryItem(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });
  app.delete(api.itineraryItems.delete.path, requireAuth, async (req, res) => {
    await storage.deleteItineraryItem(Number(req.params.id));
    res.status(204).send();
  });

  app.post(api.ai.phrases.path, requireAuth, async (req, res) => {
    try {
      const { destination } = api.ai.phrases.input.parse(req.body);
      const raw = await aiChat([
        { role: "system", content: "You are a language guide for travelers. Provide 10-15 essential phrases travelers need at the destination. For each phrase, include the English meaning, the local language translation, and a phonetic pronunciation guide. Format clearly with markdown. Always respond in English with translations." },
        { role: "user", content: `Give me essential travel phrases for visiting ${destination}. Include greetings, ordering food, asking for directions, emergencies, and common polite expressions. Respond in English with local language translations and pronunciation.` }
      ]);
      const phrases = stripThinkTags(raw || "No phrases available.");
      res.json({ phrases });
    } catch (error) {
      console.error("AI Phrases Error:", error);
      res.status(500).json({ message: "Failed to generate phrases" });
    }
  });

  app.post(api.ai.weather.path, requireAuth, async (req, res) => {
    try {
      const { destination, startDate, endDate } = api.ai.weather.input.parse(req.body);
      const dateRange = startDate && endDate ? `from ${startDate} to ${endDate}` : "for an upcoming trip";
      const raw = await aiChat([
        { role: "system", content: "You are a travel weather advisor. Provide a helpful weather forecast summary for the destination and time period. Include expected temperatures, rainfall, what to wear, and any weather-related travel tips. Always respond in English. Format with markdown." },
        { role: "user", content: `What weather should a traveler expect in ${destination} ${dateRange}? Include temperature ranges, precipitation, clothing recommendations, and any weather warnings. Respond in English.` }
      ]);
      const forecast = stripThinkTags(raw || "No forecast available.");
      res.json({ forecast });
    } catch (error) {
      console.error("AI Weather Error:", error);
      res.status(500).json({ message: "Failed to generate weather forecast" });
    }
  });

  return httpServer;
}
