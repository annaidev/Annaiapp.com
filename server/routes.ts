import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

// Set up OpenAI using Replit AI Integrations credentials
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Trips CRUD
  app.get(api.trips.list.path, async (req, res) => {
    const trips = await storage.getTrips();
    res.json(trips);
  });

  app.get(api.trips.get.path, async (req, res) => {
    const trip = await storage.getTrip(Number(req.params.id));
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    res.json(trip);
  });

  app.post(api.trips.create.path, async (req, res) => {
    try {
      const input = api.trips.create.input.parse(req.body);
      const trip = await storage.createTrip(input);
      
      // Prefill packing list using AI
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
        // We don't fail the trip creation if AI prefill fails
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

  app.put(api.trips.update.path, async (req, res) => {
    try {
      const input = api.trips.update.input.parse(req.body);
      const trip = await storage.updateTrip(Number(req.params.id), input);
      if (!trip) {
        return res.status(404).json({ message: 'Trip not found' });
      }
      res.json(trip);
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

  app.delete(api.trips.delete.path, async (req, res) => {
    await storage.deleteTrip(Number(req.params.id));
    res.status(204).send();
  });

  // Packing Lists CRUD
  app.get(api.packingLists.listByTrip.path, async (req, res) => {
    const items = await storage.getPackingListsByTrip(Number(req.params.tripId));
    res.json(items);
  });

  app.post(api.packingLists.create.path, async (req, res) => {
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

  app.put(api.packingLists.update.path, async (req, res) => {
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

  app.delete(api.packingLists.delete.path, async (req, res) => {
    await storage.deletePackingList(Number(req.params.id));
    res.status(204).send();
  });

  // AI Endpoints
  app.post(api.ai.generatePackingList.path, async (req, res) => {
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

  app.post(api.ai.culturalTips.path, async (req, res) => {
    try {
      const { destination } = api.ai.culturalTips.input.parse(req.body);
      
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: "You are a travel expert providing concise, actionable cultural customs and etiquette tips. Format with markdown." },
          { role: "user", content: `Give me 3-5 important cultural customs, tips, and etiquette advice for visiting ${destination}.` }
        ],
      });
      
      const tips = response.choices[0]?.message?.content || "No tips available.";
      res.json({ tips });
    } catch (error) {
      console.error("AI Cultural Tips Error:", error);
      res.status(500).json({ message: "Failed to fetch cultural tips" });
    }
  });

  app.post(api.ai.safetyAdvice.path, async (req, res) => {
    try {
      const { destination, citizenship } = api.ai.safetyAdvice.input.parse(req.body);
      
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: "You are a travel safety and diplomatic expert. Provide concise advice on areas to avoid, common scams, and general safety. ALSO, if provided with a citizenship, find and include the location and contact information for the nearest embassy or consulate of that country in the destination. Format with clear markdown headings." },
          { role: "user", content: `What are the safety concerns and embassy information for a ${citizenship || "traveler"} visiting ${destination}?` }
        ],
      });
      
      const advice = response.choices[0]?.message?.content || "No safety advice available.";
      res.json({ advice });
    } catch (error) {
      console.error("AI Safety Advice Error:", error);
      res.status(500).json({ message: "Failed to fetch safety advice" });
    }
  });

  app.post(api.ai.safetyMap.path, async (req, res) => {
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
Include a mix of safe tourist areas, areas requiring caution, and areas travelers should avoid. Use real neighborhood names and accurate coordinates. Return ONLY valid JSON.`
          },
          { role: "user", content: `Provide safety zone data for ${destination}.` }
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

  // Call seed function at startup
  seedDatabase().catch(console.error);

  return httpServer;
}

async function seedDatabase() {
  const existingTrips = await storage.getTrips();
  if (existingTrips.length === 0) {
    const trip1 = await storage.createTrip({ 
      destination: "Kyoto, Japan", 
      startDate: new Date(new Date().getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      endDate: new Date(new Date().getTime() + 21 * 24 * 60 * 60 * 1000), // 21 days from now
      notes: "Staying near Gion. Plan to visit bamboo forest." 
    });
    
    await storage.createPackingList({ tripId: trip1.id, item: "Passport", isPacked: true });
    await storage.createPackingList({ tripId: trip1.id, item: "Universal Adapter", isPacked: false });
    await storage.createPackingList({ tripId: trip1.id, item: "Walking Shoes", isPacked: false });
    
    await storage.createTrip({ 
      destination: "Rome, Italy", 
      startDate: new Date(new Date().getTime() + 60 * 24 * 60 * 60 * 1000), 
      endDate: new Date(new Date().getTime() + 67 * 24 * 60 * 60 * 1000),
      notes: "Book Colosseum tickets in advance!" 
    });
  }
}
