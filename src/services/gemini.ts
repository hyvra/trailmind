import { UserProfile, SavedLocation, RouteOption } from "../types";

export async function generateRidePlan(
  intent: string,
  location: string,
  profile: UserProfile,
  savedLocations: SavedLocation[],
  pastRides: any[]
): Promise<RouteOption[]> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, location, profile, savedLocations }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate ride plan");
  }

  return response.json();
}
