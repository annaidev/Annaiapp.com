import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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
      const input = api.trips.create.input.parse(req.body);
      const trip = await storage.createTrip({ ...input, userId: req.user!.id });
      
      try {
        const prompt = `Generate a concise essential packing list for a trip to ${trip.destination}. 
        Include location-specific essentials like universal adapters (if international/overseas from US/EU), 
        jackets/clothing based on typical weather, and must-have travel documents. 
        Return ONLY a JSON object with a single key 'items' containing an array of strings.`;
        
        const aiResponse = await openai.chat.completions.create({
          model: "gpt-5.1",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        });
        
        const content = aiResponse.choices[0]?.message?.content;
        if (content) {
          const { items } = JSON.parse(content);
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
      const input = api.trips.update.input.parse(req.body);
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
      
      const prompt = `Generate a concise packing list for a trip to ${destination}${days ? ` for ${days} days` : ''}. Return ONLY a JSON object with a single key 'items' containing an array of strings.`;
      
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });
      
      const content = response.choices[0]?.message?.content;
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
      
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: "You are a travel expert providing concise, actionable cultural customs and etiquette tips. Always respond in English. Format with markdown." },
          { role: "user", content: `Give me 3-5 important cultural customs, tips, and etiquette advice for visiting ${destination}. Respond entirely in English.` }
        ],
      });
      
      const tips = response.choices[0]?.message?.content || "No tips available.";
      res.json({ tips });
    } catch (error) {
      console.error("AI Cultural Tips Error:", error);
      res.status(500).json({ message: "Failed to fetch cultural tips" });
    }
  });

  app.post(api.ai.safetyAdvice.path, requireAuth, async (req, res) => {
    try {
      const { destination, citizenship } = api.ai.safetyAdvice.input.parse(req.body);
      
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: "You are a travel safety and diplomatic expert. Provide concise advice on areas to avoid, common scams, and general safety. ALSO, if provided with a citizenship, find and include the location and contact information for the nearest embassy or consulate of that country in the destination. Always respond in English. Format with clear markdown headings." },
          { role: "user", content: `What are the safety concerns and embassy information for a ${citizenship || "traveler"} visiting ${destination}? Respond entirely in English.` }
        ],
      });
      
      const advice = response.choices[0]?.message?.content || "No safety advice available.";
      res.json({ advice });
    } catch (error) {
      console.error("AI Safety Advice Error:", error);
      res.status(500).json({ message: "Failed to fetch safety advice" });
    }
  });

  app.post(api.ai.safetyMap.path, requireAuth, async (req, res) => {
    try {
      const { destination } = api.ai.safetyMap.input.parse(req.body);

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          {
            role: "system",
            content: `You are a travel safety data analyst. Given a destination, return a JSON object with:
1. "center": { "lat": number, "lng": number } — the geographic center of the destination city.
2. "zones": an array of 6-10 notable areas/neighborhoods, each with:
   - "name": the area/neighborhood name
   - "lat": latitude (number)
   - "lng": longitude (number) 
   - "radius": radius in meters (300-1500)
   - "level": one of "safe", "caution", or "avoid"
   - "description": a brief one-sentence reason
Include a mix of safe tourist areas, areas requiring caution, and areas travelers should avoid. Use real neighborhood names and accurate coordinates. All names and descriptions must be in English. Return ONLY valid JSON.`
          },
          { role: "user", content: `Provide safety zone data for ${destination}. Use English for all names and descriptions.` }
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
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
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: "You are a language guide for travelers. Provide 10-15 essential phrases travelers need at the destination. For each phrase, include the English meaning, the local language translation, and a phonetic pronunciation guide. Format clearly with markdown. Always respond in English with translations." },
          { role: "user", content: `Give me essential travel phrases for visiting ${destination}. Include greetings, ordering food, asking for directions, emergencies, and common polite expressions. Respond in English with local language translations and pronunciation.` }
        ],
      });
      const phrases = response.choices[0]?.message?.content || "No phrases available.";
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
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: "You are a travel weather advisor. Provide a helpful weather forecast summary for the destination and time period. Include expected temperatures, rainfall, what to wear, and any weather-related travel tips. Always respond in English. Format with markdown." },
          { role: "user", content: `What weather should a traveler expect in ${destination} ${dateRange}? Include temperature ranges, precipitation, clothing recommendations, and any weather warnings. Respond in English.` }
        ],
      });
      const forecast = response.choices[0]?.message?.content || "No forecast available.";
      res.json({ forecast });
    } catch (error) {
      console.error("AI Weather Error:", error);
      res.status(500).json({ message: "Failed to generate weather forecast" });
    }
  });

  return httpServer;
}
