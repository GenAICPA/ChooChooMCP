#!/usr/bin/env node

/**
 * Train Horn Tracker MCP Server
 *
 * This MCP server helps identify train horn locations based on:
 * - Railroad crossing locations near Camp Hill, PA
 * - Current weather conditions (wind, temperature)
 * - Sound propagation physics
 * - Amtrak schedule data
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OBSERVATIONS_FILE = path.join(__dirname, "..", "observations.json");

// Your location in Camp Hill, PA
// NOTE: These values are currently hardcoded for the initial implementation.
// Future plans include generalizing this to allow dynamic location configuration.
const HOME_LAT = 40.2398;
const HOME_LON = -76.9197;

// Known railroad crossings in the Harrisburg/Enola area
// These are approximate locations of major crossings
const RAILROAD_CROSSINGS = [
  // Enola Yard area
  { name: "Enola Yard - Market St", lat: 40.2889, lon: -76.9364, line: "Norfolk Southern Main" },
  { name: "Enola Yard - Altoona Ave", lat: 40.2856, lon: -76.9422, line: "Norfolk Southern Main" },
  { name: "East Pennsboro - Fishing Creek Valley Rd", lat: 40.3001, lon: -76.9156, line: "Norfolk Southern Main" },

  // Harrisburg waterfront
  { name: "Harrisburg - Cameron St", lat: 40.2632, lon: -76.8864, line: "Norfolk Southern Main" },
  { name: "Harrisburg - Forster St", lat: 40.2598, lon: -76.8831, line: "Norfolk Southern Main" },
  { name: "Harrisburg - Market St", lat: 40.2626, lon: -76.8819, line: "Norfolk Southern Main" },

  // Lemoyne area
  { name: "Lemoyne - Herman Ave", lat: 40.2389, lon: -76.8978, line: "Norfolk Southern" },
  { name: "Lemoyne - Hummel Ave", lat: 40.2342, lon: -76.8942, line: "Norfolk Southern" },

  // Mechanicsburg area (Naval facility line)
  { name: "Mechanicsburg - Trindle Rd", lat: 40.2139, lon: -77.0086, line: "Norfolk Southern Branch" },
  { name: "Naval Support - Simpson Ferry Rd", lat: 40.2267, lon: -76.9797, line: "Norfolk Southern Branch" },

  // West Shore
  { name: "New Cumberland - Bridge St", lat: 40.2322, lon: -76.8656, line: "Norfolk Southern" },
  { name: "Wormleysburg - Front St", lat: 40.2586, lon: -76.9125, line: "Norfolk Southern" },
];

interface WeatherData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number; // degrees
  conditions: string;
}

interface SoundPropagation {
  maxDistance: number; // in miles
  favorableDirection: number; // wind direction in degrees
  attenuationFactor: number; // 0-1, how much sound is attenuated
}

// Calculate distance between two lat/lon points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate bearing from point 1 to point 2
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// Get current weather from Open-Meteo API
async function getCurrentWeather(): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${HOME_LAT}&longitude=${HOME_LON}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`;

  try {
    const response = await fetch(url);
    const data = await response.json() as any;

    return {
      temperature: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      windDirection: data.current.wind_direction_10m,
      conditions: getWeatherDescription(data.current.weather_code),
    };
  } catch (error) {
    throw new Error(`Failed to fetch weather: ${error}`);
  }
}

function getWeatherDescription(code: number): string {
  const weatherCodes: { [key: number]: string } = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    80: "Slight rain showers",
    95: "Thunderstorm",
  };
  return weatherCodes[code] || "Unknown";
}

// Calculate sound propagation based on weather
function calculateSoundPropagation(weather: WeatherData): SoundPropagation {
  // Base distance for train horn (diesel horn is ~110-120 dB at source)
  let maxDistance = 3.0; // miles in ideal conditions

  // Temperature effect (sound travels farther in warmer air)
  if (weather.temperature > 60) {
    maxDistance += 0.5;
  } else if (weather.temperature < 32) {
    maxDistance -= 0.5;
  }

  // Humidity effect (humid air carries sound better)
  if (weather.humidity > 70) {
    maxDistance += 0.3;
  } else if (weather.humidity < 30) {
    maxDistance -= 0.3;
  }

  // Wind effect (significant impact on sound travel)
  const windEffect = weather.windSpeed / 10; // roughly 0.5 miles per 5 mph

  // Attenuation factor (0 = fully blocked, 1 = no attenuation)
  let attenuationFactor = 1.0;
  if (weather.conditions.includes("rain") || weather.conditions.includes("snow")) {
    attenuationFactor = 0.6;
  } else if (weather.conditions.includes("fog")) {
    attenuationFactor = 0.8;
  }

  return {
    maxDistance: Math.max(1.0, maxDistance), // minimum 1 mile
    favorableDirection: weather.windDirection,
    attenuationFactor,
  };
}

// Find likely crossing locations based on current conditions
async function findLikelyCrossings() {
  const weather = await getCurrentWeather();
  const propagation = calculateSoundPropagation(weather);

  const likelyCrossings = RAILROAD_CROSSINGS.map(crossing => {
    const distance = calculateDistance(HOME_LAT, HOME_LON, crossing.lat, crossing.lon);
    const bearing = calculateBearing(HOME_LAT, HOME_LON, crossing.lat, crossing.lon);

    // Calculate wind advantage/disadvantage
    // Wind blowing FROM the crossing TO home is favorable
    const windAdvantage = Math.cos((bearing - propagation.favorableDirection) * Math.PI / 180);
    const effectiveDistance = distance / (1 + windAdvantage * 0.5); // wind can extend range by 50%

    const audible = effectiveDistance <= propagation.maxDistance;
    const probability = audible ?
      (1 - effectiveDistance / propagation.maxDistance) * propagation.attenuationFactor : 0;

    return {
      ...crossing,
      distance: parseFloat(distance.toFixed(2)),
      bearing: Math.round(bearing),
      effectiveDistance: parseFloat(effectiveDistance.toFixed(2)),
      audible,
      probability: parseFloat(probability.toFixed(2)),
    };
  })
  .filter(c => c.audible)
  .sort((a, b) => b.probability - a.probability);

  return {
    weather,
    propagation,
    crossings: likelyCrossings,
  };
}

// Get Amtrak trains passing through Harrisburg
// NOTE: Currently hardcoded to Harrisburg (HAR) for the initial implementation.
// Future plans include allowing dynamic station selection.
async function getAmtrakSchedule() {
  // Harrisburg station code is HAR
  const url = "https://api-v3.amtraker.com/v3/stations/HAR";

  try {
    const response = await fetch(url);
    const data = await response.json() as any;

    // The Amtraker V3 API returns station data keyed by station code
    const stationData = data.HAR;

    if (!stationData || !stationData.trains) {
      return { trains: [], station: "Harrisburg, PA (HAR)" };
    }

    const now = new Date();

    // Note: In some V3 responses, trains is an array of IDs.
    // In others, it may contain more data. If it's just IDs,
    // we would need additional fetches per train.
    // For this implementation, we assume the structure matches the original code's expectations.
    const trains = stationData.trains
      .filter((train: any) => {
        // Only show trains within 2 hours
        const schDep = train.schDep ? new Date(train.schDep) : null;
        const schArr = train.schArr ? new Date(train.schArr) : null;
        const timeDiff = schDep ?
          (schDep.getTime() - now.getTime()) / (1000 * 60) :
          schArr ? (schArr.getTime() - now.getTime()) / (1000 * 60) : 999;
        return Math.abs(timeDiff) <= 120;
      })
      .map((train: any) => ({
        trainNum: train.trainNum,
        trainName: train.routeName,
        status: train.trainState,
        scheduledArrival: train.schArr,
        estimatedArrival: train.estArr,
        scheduledDeparture: train.schDep,
        estimatedDeparture: train.estDep,
      }));

    return {
      station: "Harrisburg, PA (HAR)",
      trains,
    };
  } catch (error) {
    return {
      station: "Harrisburg, PA (HAR)",
      trains: [],
      error: "Unable to fetch Amtrak data",
    };
  }
}

// Create observation log entry and persist it
async function createObservation(notes: string = "") {
  const observation = {
    timestamp: new Date().toISOString(),
    location: "Camp Hill, PA",
    notes,
  };

  try {
    let observations = [];
    try {
      const data = await fs.readFile(OBSERVATIONS_FILE, "utf-8");
      observations = JSON.parse(data);
    } catch (e) {
      // File doesn't exist or is invalid, start with empty array
    }

    observations.push(observation);
    await fs.writeFile(OBSERVATIONS_FILE, JSON.stringify(observations, null, 2));
  } catch (error) {
    console.error("Failed to save observation:", error);
  }

  return observation;
}

// Create and configure the MCP server
const server = new Server(
  {
    name: "train-horn-tracker",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "identify_horn_location",
        description: "Identify likely railroad crossing locations where a train horn was heard, based on current weather conditions and sound propagation. Returns crossings sorted by probability of being the source.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_amtrak_schedule",
        description: "Get current Amtrak train schedule for Harrisburg station, showing trains within 2 hours of now.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_weather_conditions",
        description: "Get current weather conditions that affect sound propagation (temperature, humidity, wind speed and direction).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "log_observation",
        description: "Create a timestamped observation log entry when you hear a train horn. Include any notes about the sound (direction, number of blasts, duration, etc.).",
        inputSchema: {
          type: "object",
          properties: {
            notes: {
              type: "string",
              description: "Optional notes about the horn sound (e.g., 'Very loud, seemed to come from northwest, standard crossing pattern')",
            },
          },
        },
      },
      {
        name: "list_crossings",
        description: "List all known railroad crossings in the database with their locations and distances from Camp Hill.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (request.params.name === "identify_horn_location") {
      const result = await findLikelyCrossings();

      let response = `🚂 Train Horn Location Analysis\n\n`;
      response += `📍 Your Location: Camp Hill, PA\n`;
      response += `🌡️  Temperature: ${result.weather.temperature}°F\n`;
      response += `💧 Humidity: ${result.weather.humidity}%\n`;
      response += `💨 Wind: ${result.weather.windSpeed} mph from ${result.weather.windDirection}° (${getCompassDirection(result.weather.windDirection)})\n`;
      response += `☁️  Conditions: ${result.weather.conditions}\n`;
      response += `📡 Max Audible Range: ~${result.propagation.maxDistance.toFixed(1)} miles\n\n`;

      if (result.crossings.length === 0) {
        response += `No crossings are likely audible under current conditions.\n`;
      } else {
        response += `🎯 Likely Crossing Locations (sorted by probability):\n\n`;
        result.crossings.forEach((crossing, i) => {
          response += `${i + 1}. ${crossing.name}\n`;
          response += `   Line: ${crossing.line}\n`;
          response += `   Distance: ${crossing.distance} mi (effective: ${crossing.effectiveDistance} mi)\n`;
          response += `   Direction: ${crossing.bearing}° (${getCompassDirection(crossing.bearing)})\n`;
          response += `   Probability: ${(crossing.probability * 100).toFixed(0)}%\n\n`;
        });
      }

      return {
        content: [{ type: "text", text: response }],
      };
    }

    if (request.params.name === "get_amtrak_schedule") {
      const schedule = await getAmtrakSchedule();

      let response = `🚆 Amtrak Schedule - ${schedule.station}\n\n`;

      if (schedule.trains.length === 0) {
        response += `No Amtrak trains scheduled within the next 2 hours.\n`;
        if ((schedule as any).error) {
          response += `\n⚠️  ${(schedule as any).error}\n`;
        }
      } else {
        schedule.trains.forEach((train: any) => {
          response += `Train ${train.trainNum} - ${train.trainName}\n`;
          response += `Status: ${train.status}\n`;
          if (train.scheduledArrival) {
            response += `Arrival: ${new Date(train.scheduledArrival).toLocaleTimeString()}`;
            if (train.estimatedArrival) {
              response += ` (Est: ${new Date(train.estimatedArrival).toLocaleTimeString()})`;
            }
            response += `\n`;
          }
          if (train.scheduledDeparture) {
            response += `Departure: ${new Date(train.scheduledDeparture).toLocaleTimeString()}`;
            if (train.estimatedDeparture) {
              response += ` (Est: ${new Date(train.estimatedDeparture).toLocaleTimeString()})`;
            }
            response += `\n`;
          }
          response += `\n`;
        });
      }

      return {
        content: [{ type: "text", text: response }],
      };
    }

    if (request.params.name === "get_weather_conditions") {
      const weather = await getCurrentWeather();
      const propagation = calculateSoundPropagation(weather);

      const response = `🌤️  Current Weather Conditions\n\n` +
        `Temperature: ${weather.temperature}°F\n` +
        `Humidity: ${weather.humidity}%\n` +
        `Wind: ${weather.windSpeed} mph from ${weather.windDirection}° (${getCompassDirection(weather.windDirection)})\n` +
        `Conditions: ${weather.conditions}\n\n` +
        `🔊 Sound Propagation Estimate:\n` +
        `Max audible range: ~${propagation.maxDistance.toFixed(1)} miles\n` +
        `Attenuation factor: ${(propagation.attenuationFactor * 100).toFixed(0)}%\n` +
        `Best direction for sound travel: From ${getCompassDirection(weather.windDirection)}`;

      return {
        content: [{ type: "text", text: response }],
      };
    }

    if (request.params.name === "log_observation") {
      const notes = (request.params.arguments as any)?.notes || "";
      const observation = await createObservation(notes);

      const response = `📝 Observation Logged\n\n` +
        `Time: ${new Date(observation.timestamp).toLocaleString()}\n` +
        `Location: ${observation.location}\n` +
        `Notes: ${observation.notes || "(none)"}\n\n` +
        `💡 Tip: Run 'identify_horn_location' to see likely crossing locations based on current conditions.`;

      return {
        content: [{ type: "text", text: response }],
      };
    }

    if (request.params.name === "list_crossings") {
      let response = `🛤️  Known Railroad Crossings\n\n`;

      const crossingsWithDistance = RAILROAD_CROSSINGS.map(crossing => ({
        ...crossing,
        distance: calculateDistance(HOME_LAT, HOME_LON, crossing.lat, crossing.lon),
        bearing: calculateBearing(HOME_LAT, HOME_LON, crossing.lat, crossing.lon),
      }))
      .sort((a, b) => a.distance - b.distance);

      crossingsWithDistance.forEach((crossing, i) => {
        response += `${i + 1}. ${crossing.name}\n`;
        response += `   Line: ${crossing.line}\n`;
        response += `   Distance: ${crossing.distance.toFixed(2)} miles\n`;
        response += `   Direction: ${Math.round(crossing.bearing)}° (${getCompassDirection(crossing.bearing)})\n`;
        response += `   Coordinates: ${crossing.lat}, ${crossing.lon}\n\n`;
      });

      return {
        content: [{ type: "text", text: response }],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

function getCompassDirection(degrees: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                     "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Train Horn Tracker MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});