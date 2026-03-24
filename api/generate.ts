import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { intent, location, profile, savedLocations } = req.body;

  const prompt = `
    You are an expert cycling assistant. Create 2-3 personalized ride options.

    USER PROFILE:
    - Body: ${profile.height} height, ${profile.weight} weight, ${profile.inseam} inseam.
    - Injuries: ${JSON.stringify(profile.injuries)}
    - Bike: ${profile.bikeType}, ${profile.wheelSize} wheels, ${profile.suspension} suspension.
    - Home Base: ${profile.homeBase}

    SAVED LOCATIONS:
    ${(savedLocations || []).map((l: any) => `- ${l.name}: ${l.notes}`).join('\n')}

    INTENT: ${intent}
    LOCATION: ${location}

    TASK:
    1. Generate 2-3 distinct route options.
    2. For each route, provide:
       - Name, Distance, Elevation, Terrain description, Conditions.
       - A set of coordinates (lat, lng) representing a simplified route path (at least 5-10 points).
       - Bike setup: Specific tire PSI and suspension settings based on the terrain and user weight.
       - Body prep: Specific stretches or warmups based on the user's injuries.
       - Gear list: What to pack based on activity and likely weather for that location.

    Return the response as a JSON array of RouteOption objects.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              distance: { type: Type.STRING },
              elevation: { type: Type.STRING },
              terrain: { type: Type.STRING },
              conditions: { type: Type.STRING },
              coordinates: {
                type: Type.ARRAY,
                items: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER }
                }
              },
              bikeSetup: {
                type: Type.OBJECT,
                properties: {
                  psi: { type: Type.STRING },
                  suspension: { type: Type.STRING }
                },
                required: ["psi", "suspension"]
              },
              bodyPrep: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              gearList: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["id", "name", "distance", "elevation", "terrain", "conditions", "coordinates", "bikeSetup", "bodyPrep", "gearList"]
          }
        }
      }
    });

    const routes = JSON.parse(response.text || "[]");
    return res.status(200).json(routes);
  } catch (error: any) {
    console.error("Gemini API error:", error);
    return res.status(500).json({ error: "Failed to generate ride plan" });
  }
}
