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

// Your location in Camp Hill, PA
const HOME_LAT = 40.2398;
const HOME_LON = -76.9197;

// Known railroad crossings and key locations in the Harrisburg/Enola area
// Based on NS Harrisburg Terminal coverage and local geography
const RAILROAD_CROSSINGS = [
  // Major Interlockings (high horn activity - trains switching, slowing, merging)
  { 
    name: "HARRISBURG Interlocking (Harris Tower)", 
    lat: 40.2637, lon: -76.8825, 
    line: "Pittsburgh Line / Harrisburg Line / Amtrak",
    type: "interlocking",
    notes: "NS/Amtrak interchange, high traffic, multiple crossings"
  },
  { 
    name: "ROCKVILLE Interlocking", 
    lat: 40.2889, lon: -76.9347, 
    line: "Pittsburgh Line / Buffalo Line junction",
    type: "interlocking",
    notes: "Major junction, Enola Yard access"
  },
  { 
    name: "MARY Interlocking (Enola connection)", 
    lat: 40.2794, lon: -76.9431, 
    line: "Port Road Branch / Pittsburgh Line",
    type: "interlocking",
    notes: "Enola Yard traffic to Pittsburgh Line"
  },
  { 
    name: "BANKS Interlocking (Enola connection)", 
    lat: 40.2822, lon: -76.9264, 
    line: "Port Road Branch / Pittsburgh Line",
    type: "interlocking",
    notes: "Enola Yard traffic to Pittsburgh Line"
  },
  
  // Enola Yard area crossings
  { name: "Enola Yard - Market St", lat: 40.2889, lon: -76.9364, line: "Buffalo Line", type: "crossing" },
  { name: "Enola Yard - Altoona Ave", lat: 40.2856, lon: -76.9422, line: "Port Road Branch", type: "crossing" },
  { name: "East Pennsboro - Fishing Creek Valley Rd", lat: 40.3001, lon: -76.9156, line: "Buffalo Line", type: "crossing" },
  
  // Harrisburg waterfront crossings
  { name: "Harrisburg - Cameron St", lat: 40.2632, lon: -76.8864, line: "Pittsburgh Line", type: "crossing" },
  { name: "Harrisburg - Forster St", lat: 40.2598, lon: -76.8831, line: "Pittsburgh Line", type: "crossing" },
  { name: "Harrisburg - Market St (downtown)", lat: 40.2626, lon: -76.8819, line: "Pittsburgh Line", type: "crossing" },
  
  // Harrisburg Fuel Pad (trains stop/idle here)
  {
    name: "Harrisburg Fuel Pad",
    lat: 40.2711, lon: -76.9011,
    line: "Pittsburgh Line (PT 107.5)",
    type: "facility",
    notes: "Trains refuel here - expect idling, horn blasts when departing"
  },
  
  // Rutherford Intermodal Yard area
  {
    name: "RUTH Interlocking (Rutherford)",
    lat: 40.2478, lon: -76.8667,
    line: "Harrisburg Line / Rutherford Industrial Track",
    type: "interlocking",
    notes: "Container traffic, frequent switching"
  },
  {
    name: "BEAVER Interlocking (Rutherford)",
    lat: 40.2389, lon: -76.8589,
    line: "Harrisburg Line / Rutherford Industrial Track",
    type: "interlocking",
    notes: "Rutherford Yard access"
  },
  
  // Lemoyne area
  { name: "Lemoyne - Herman Ave", lat: 40.2389, lon: -76.8978, line: "Pittsburgh Line", type: "crossing" },
  { name: "Lemoyne - Hummel Ave", lat: 40.2342, lon: -76.8942, line: "Pittsburgh Line", type: "crossing" },
  
  // Mechanicsburg area (Naval facility line)
  { name: "Mechanicsburg - Trindle Rd", lat: 40.2139, lon: -77.0086, line: "Lurgan Branch", type: "crossing" },
  { name: "Naval Support - Simpson Ferry Rd", lat: 40.2267, lon: -76.9797, line: "Lurgan Branch", type: "crossing" },
  
  // West Shore
  { name: "New Cumberland - Bridge St", lat: 40.2322, lon: -76.8656, line: "Royalton Branch", type: "crossing" },
  { name: "Wormleysburg - Front St", lat: 40.2586, lon: -76.9125, line: "Pittsburgh Line", type: "crossing" },
  
  // PAXTON area (multiple line junction)
  {
    name: "PAXTON Interlocking",
    lat: 40.2644, lon: -76.8897,
    line: "Lurgan Branch / Royalton Branch junction",
    type: "interlocking",
    notes: "Multiple lines converge - high horn activity"
  },
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

// NS Harrisburg Terminal rail line information
const RAIL_LINES = {
  "Buffalo Line": {
    code: "BR",
    description: "Runs from North Ferry (BR 294.7) to Rockville junction (BR 306.2)",
    endpoints: ["North Ferry", "Rockville"],
    traffic: "Through freight, connections to Pittsburgh Line",
  },
  "Harrisburg Line": {
    code: "HP",
    description: "Burke interlocking (HP 104.2) near Hummelstown to Harrisburg (HP 112.9)",
    endpoints: ["Burke", "Harrisburg (Harris Tower)"],
    traffic: "Amtrak Keystone Corridor (electrified east of Harrisburg), freight",
  },
  "Lurgan Branch": {
    code: "LG",
    description: "Lee's Cross Roads (LG 36.3) near Shippensburg to Paxton/Capitol (LG 0.0)",
    endpoints: ["Lee's Cross Roads", "Paxton"],
    traffic: "Naval Support Activity Mechanicsburg, industrial traffic",
  },
  "Pittsburgh Line": {
    code: "PT",
    description: "McVey (PT 179.6) at McVeytown to Harrisburg (PT 105.1)",
    endpoints: ["McVey", "Harrisburg (Harris Tower)"],
    traffic: "Major east-west mainline, heavy through freight, Amtrak Pennsylvanian",
  },
  "Port Road Branch": {
    code: "EP",
    description: "Connects Enola Yard to Pittsburgh Line at Mary (EP 73.7) and Banks (EP 76.1)",
    endpoints: ["Enola Yard", "Mary/Banks"],
    traffic: "Enola Yard classification traffic, connecting to Pittsburgh Line",
  },
  "Royalton Branch": {
    code: "RY",
    description: "Roy (RY 11.0) in Royalton to Paxton (RY 21.9) in Harrisburg",
    endpoints: ["Royalton", "Paxton"],
    traffic: "Local freight, connects to Lurgan Branch at Paxton",
  },
  "Rutherford Industrial Track": {
    code: "RIT",
    description: "Serves Rutherford Intermodal Yard, connects to Harrisburg Line",
    endpoints: ["Ruth (HP 108.8)", "Beaver (HP 105.0)"],
    traffic: "Container/intermodal traffic, frequent switching operations",
  },
  "Steelton Industrial Track": {
    code: "SIT",
    description: "Harrisburg to Steelton, PA",
    endpoints: ["Harrisburg", "Steelton"],
    traffic: "Industrial customers in Steelton area",
  },
};

// Traffic patterns based on NS Harrisburg Terminal operations
const TRAFFIC_PATTERNS = {
  "Early Morning (12am-6am)": {
    description: "Peak freight movement period",
    hotspots: ["Enola Yard", "MARY/BANKS interlockings", "Pittsburgh Line mainline"],
    notes: "Yard classification work at Enola, through freights departing, less Amtrak activity",
  },
  "Morning Rush (6am-10am)": {
    description: "Amtrak Keystone service + freight",
    hotspots: ["HARRISBURG interlocking", "Harrisburg Line", "Fuel Pad"],
    notes: "Multiple Amtrak Keystones to/from Philadelphia/NYC, freight continues",
  },
  "Midday (10am-4pm)": {
    description: "Mixed freight and passenger",
    hotspots: ["Rutherford Yard", "Pittsburgh Line", "Enola Yard"],
    notes: "Container trains at Rutherford, through freight on Pittsburgh Line",
  },
  "Evening Rush (4pm-8pm)": {
    description: "Amtrak Keystone service peak + freight",
    hotspots: ["HARRISBURG interlocking", "Harrisburg Line", "ROCKVILLE"],
    notes: "Heavy Amtrak traffic returning from Philadelphia, freight traffic continues",
  },
  "Night (8pm-12am)": {
    description: "Freight operations ramp up",
    hotspots: ["Enola Yard", "Pittsburgh Line", "MARY/BANKS"],
    notes: "Yard switching increases, through freight builds for overnight departure",
  },
};

// Milepost reference points for location lookup
const MILEPOST_REFERENCES = [
  // Pittsburgh Line (PT)
  { line: "PT", milepost: 105.1, name: "HARRISBURG interlocking (Harris Tower)", lat: 40.2637, lon: -76.8825 },
  { line: "PT", milepost: 107.5, name: "Harrisburg Fuel Pad", lat: 40.2711, lon: -76.9011 },
  { line: "PT", milepost: 109.9, name: "ROCKVILLE interlocking", lat: 40.2889, lon: -76.9347 },
  { line: "PT", milepost: 110.9, name: "MARY interlocking", lat: 40.2794, lon: -76.9431 },
  { line: "PT", milepost: 113.2, name: "BANKS interlocking", lat: 40.2822, lon: -76.9264 },
  
  // Harrisburg Line (HP)
  { line: "HP", milepost: 105.0, name: "BEAVER interlocking", lat: 40.2389, lon: -76.8589 },
  { line: "HP", milepost: 108.8, name: "RUTH interlocking", lat: 40.2478, lon: -76.8667 },
  { line: "HP", milepost: 112.9, name: "HARRISBURG interlocking", lat: 40.2637, lon: -76.8825 },
  
  // Buffalo Line (BR)
  { line: "BR", milepost: 306.2, name: "ROCKVILLE junction", lat: 40.2889, lon: -76.9347 },
  
  // Port Road Branch (EP)
  { line: "EP", milepost: 73.7, name: "MARY connection", lat: 40.2794, lon: -76.9431 },
  { line: "EP", milepost: 76.1, name: "BANKS connection", lat: 40.2822, lon: -76.9264 },
  
  // Lurgan Branch (LG)
  { line: "LG", milepost: 0.0, name: "PAXTON/CAPITOL", lat: 40.2644, lon: -76.8897 },
  
  // Royalton Branch (RY)
  { line: "RY", milepost: 21.9, name: "PAXTON", lat: 40.2644, lon: -76.8897 },
];

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
  .sort((a, b) => {
    // Prioritize interlockings (more horn activity)
    if (a.type === 'interlocking' && b.type !== 'interlocking') return -1;
    if (b.type === 'interlocking' && a.type !== 'interlocking') return 1;
    // Then sort by probability
    return b.probability - a.probability;
  });
  
  return {
    weather,
    propagation,
    crossings: likelyCrossings,
  };
}

// Get Amtrak trains passing through Harrisburg
async function getAmtrakSchedule() {
  // Harrisburg station code is HAR
  const url = "https://api-v3.amtraker.com/v3/stations/HAR";
  
  try {
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (!data || !data.trains) {
      return { trains: [], station: "Harrisburg, PA (HAR)" };
    }
    
    const now = new Date();
    const trains = data.trains
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

// Create observation log entry
function createObservation(notes: string = "") {
  return {
    timestamp: new Date().toISOString(),
    location: "Camp Hill, PA",
    notes,
    instruction: "Log this observation in your own system or database",
  };
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
      {
        name: "get_traffic_patterns",
        description: "Get information about typical train traffic patterns for different times of day in the Harrisburg area. Useful for understanding when and where horn activity is most likely.",
        inputSchema: {
          type: "object",
          properties: {
            time_period: {
              type: "string",
              description: "Optional: Specific time period to check (e.g., 'morning', 'evening', 'night'). If not provided, shows current time period.",
              enum: ["early_morning", "morning", "midday", "evening", "night", "current"],
            },
          },
        },
      },
      {
        name: "explain_rail_line",
        description: "Get detailed information about a specific NS rail line in the Harrisburg Terminal area, including its route, traffic types, and significance.",
        inputSchema: {
          type: "object",
          properties: {
            line_name: {
              type: "string",
              description: "Name of the rail line (e.g., 'Pittsburgh Line', 'Buffalo Line', 'Harrisburg Line', 'Lurgan Branch', etc.)",
            },
          },
          required: ["line_name"],
        },
      },
      {
        name: "locate_milepost",
        description: "Find the approximate location of an NS milepost reference (e.g., PT 107.5, HP 112.9). Useful when monitoring railroad radio traffic.",
        inputSchema: {
          type: "object",
          properties: {
            milepost: {
              type: "string",
              description: "Milepost reference in format 'LINE MILEPOST' (e.g., 'PT 107.5', 'HP 112.9', 'BR 306.2')",
            },
          },
          required: ["milepost"],
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
          const typeEmoji = crossing.type === 'interlocking' ? '🔀' : 
                           crossing.type === 'facility' ? '⛽' : '🚦';
          response += `${i + 1}. ${typeEmoji} ${crossing.name}\n`;
          response += `   Type: ${crossing.type}\n`;
          response += `   Line: ${crossing.line}\n`;
          if (crossing.notes) response += `   Note: ${crossing.notes}\n`;
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
      const observation = createObservation(notes);
      
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
        const typeEmoji = crossing.type === 'interlocking' ? '🔀' : 
                         crossing.type === 'facility' ? '⛽' : '🚦';
        response += `${i + 1}. ${typeEmoji} ${crossing.name}\n`;
        response += `   Type: ${crossing.type || 'crossing'}\n`;
        response += `   Line: ${crossing.line}\n`;
        if (crossing.notes) response += `   Notes: ${crossing.notes}\n`;
        response += `   Distance: ${crossing.distance.toFixed(2)} miles\n`;
        response += `   Direction: ${Math.round(crossing.bearing)}° (${getCompassDirection(crossing.bearing)})\n`;
        response += `   Coordinates: ${crossing.lat}, ${crossing.lon}\n\n`;
      });
      
      return {
        content: [{ type: "text", text: response }],
      };
    }
    
    if (request.params.name === "get_traffic_patterns") {
      const args = request.params.arguments as any;
      const now = new Date();
      const hour = now.getHours();
      
      // Determine current time period if not specified
      let timePeriod = args?.time_period;
      if (!timePeriod || timePeriod === "current") {
        if (hour >= 0 && hour < 6) timePeriod = "early_morning";
        else if (hour >= 6 && hour < 10) timePeriod = "morning";
        else if (hour >= 10 && hour < 16) timePeriod = "midday";
        else if (hour >= 16 && hour < 20) timePeriod = "evening";
        else timePeriod = "night";
      }
      
      // Map time_period to TRAFFIC_PATTERNS key
      const periodMap: { [key: string]: string } = {
        "early_morning": "Early Morning (12am-6am)",
        "morning": "Morning Rush (6am-10am)",
        "midday": "Midday (10am-4pm)",
        "evening": "Evening Rush (4pm-8pm)",
        "night": "Night (8pm-12am)",
      };
      
      const periodKey = periodMap[timePeriod];
      const pattern = TRAFFIC_PATTERNS[periodKey as keyof typeof TRAFFIC_PATTERNS];
      
      let response = `🚂 Traffic Patterns - ${periodKey}\n\n`;
      response += `📊 ${pattern.description}\n\n`;
      response += `🎯 High-Activity Locations:\n`;
      pattern.hotspots.forEach((spot: string) => {
        response += `   • ${spot}\n`;
      });
      response += `\n💡 Notes: ${pattern.notes}\n\n`;
      
      // Show all periods if user wants overview
      if (args?.time_period === "all") {
        response = `🚂 Daily Traffic Patterns - NS Harrisburg Terminal\n\n`;
        Object.entries(TRAFFIC_PATTERNS).forEach(([period, info]) => {
          response += `⏰ ${period}\n`;
          response += `   ${info.description}\n`;
          response += `   Hotspots: ${info.hotspots.join(", ")}\n`;
          response += `   ${info.notes}\n\n`;
        });
      }
      
      return {
        content: [{ type: "text", text: response }],
      };
    }
    
    if (request.params.name === "explain_rail_line") {
      const args = request.params.arguments as any;
      const lineName = args?.line_name;
      
      if (!lineName) {
        return {
          content: [{ type: "text", text: "Please specify a rail line name." }],
          isError: true,
        };
      }
      
      // Find matching line (case-insensitive, partial match)
      const matchedLine = Object.entries(RAIL_LINES).find(([name]) => 
        name.toLowerCase().includes(lineName.toLowerCase()) ||
        lineName.toLowerCase().includes(name.toLowerCase())
      );
      
      if (!matchedLine) {
        const availableLines = Object.keys(RAIL_LINES).join(", ");
        return {
          content: [{ 
            type: "text", 
            text: `Rail line "${lineName}" not found. Available lines: ${availableLines}` 
          }],
          isError: true,
        };
      }
      
      const [name, info] = matchedLine;
      let response = `🛤️  ${name}\n\n`;
      response += `📋 Code: ${info.code}\n`;
      response += `📍 Route: ${info.description}\n`;
      response += `🔗 Endpoints: ${info.endpoints.join(" ↔ ")}\n`;
      response += `🚂 Traffic: ${info.traffic}\n`;
      
      return {
        content: [{ type: "text", text: response }],
      };
    }
    
    if (request.params.name === "locate_milepost") {
      const args = request.params.arguments as any;
      const milepostInput = args?.milepost?.toUpperCase().trim();
      
      if (!milepostInput) {
        return {
          content: [{ type: "text", text: "Please provide a milepost reference (e.g., PT 107.5)" }],
          isError: true,
        };
      }
      
      // Parse milepost (e.g., "PT 107.5" or "PT107.5")
      const match = milepostInput.match(/([A-Z]+)\s*(\d+\.?\d*)/);
      if (!match) {
        return {
          content: [{ 
            type: "text", 
            text: "Invalid milepost format. Use format like 'PT 107.5' or 'HP 112.9'" 
          }],
          isError: true,
        };
      }
      
      const [, lineCode, milepost] = match;
      const milepostNum = parseFloat(milepost);
      
      // Find exact match first
      const exactMatch = MILEPOST_REFERENCES.find(
        ref => ref.line === lineCode && Math.abs(ref.milepost - milepostNum) < 0.1
      );
      
      if (exactMatch) {
        const distance = calculateDistance(HOME_LAT, HOME_LON, exactMatch.lat, exactMatch.lon);
        const bearing = calculateBearing(HOME_LAT, HOME_LON, exactMatch.lat, exactMatch.lon);
        
        let response = `📍 Milepost ${lineCode} ${milepost}\n\n`;
        response += `Location: ${exactMatch.name}\n`;
        response += `Distance from you: ${distance.toFixed(2)} miles\n`;
        response += `Direction: ${Math.round(bearing)}° (${getCompassDirection(bearing)})\n`;
        response += `Coordinates: ${exactMatch.lat}, ${exactMatch.lon}\n`;
        
        return {
          content: [{ type: "text", text: response }],
        };
      }
      
      // Find nearest mileposts for interpolation
      const sameLine = MILEPOST_REFERENCES.filter(ref => ref.line === lineCode)
        .sort((a, b) => a.milepost - b.milepost);
      
      if (sameLine.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No reference points found for line ${lineCode}. Available lines: ${[...new Set(MILEPOST_REFERENCES.map(r => r.line))].join(", ")}` 
          }],
          isError: true,
        };
      }
      
      // Find bracketing mileposts
      const before = sameLine.filter(ref => ref.milepost <= milepostNum).pop();
      const after = sameLine.find(ref => ref.milepost >= milepostNum);
      
      let response = `📍 Milepost ${lineCode} ${milepost} (estimated)\n\n`;
      
      if (before && after && before !== after) {
        // Interpolate
        const ratio = (milepostNum - before.milepost) / (after.milepost - before.milepost);
        const estLat = before.lat + (after.lat - before.lat) * ratio;
        const estLon = before.lon + (after.lon - before.lon) * ratio;
        const distance = calculateDistance(HOME_LAT, HOME_LON, estLat, estLon);
        const bearing = calculateBearing(HOME_LAT, HOME_LON, estLat, estLon);
        
        response += `Estimated location between:\n`;
        response += `  ${before.name} (${lineCode} ${before.milepost})\n`;
        response += `  ${after.name} (${lineCode} ${after.milepost})\n\n`;
        response += `Distance from you: ~${distance.toFixed(2)} miles\n`;
        response += `Direction: ${Math.round(bearing)}° (${getCompassDirection(bearing)})\n`;
        response += `Approx coordinates: ${estLat.toFixed(4)}, ${estLon.toFixed(4)}\n`;
      } else if (before) {
        const distance = calculateDistance(HOME_LAT, HOME_LON, before.lat, before.lon);
        const bearing = calculateBearing(HOME_LAT, HOME_LON, before.lat, before.lon);
        response += `Nearest reference: ${before.name} (${lineCode} ${before.milepost})\n`;
        response += `Distance from you: ${distance.toFixed(2)} miles\n`;
        response += `Direction: ${Math.round(bearing)}° (${getCompassDirection(bearing)})\n`;
      } else if (after) {
        const distance = calculateDistance(HOME_LAT, HOME_LON, after.lat, after.lon);
        const bearing = calculateBearing(HOME_LAT, HOME_LON, after.lat, after.lon);
        response += `Nearest reference: ${after.name} (${lineCode} ${after.milepost})\n`;
        response += `Distance from you: ${distance.toFixed(2)} miles\n`;
        response += `Direction: ${Math.round(bearing)}° (${getCompassDirection(bearing)})\n`;
      }
      
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