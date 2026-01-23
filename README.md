# Train Horn Tracker MCP Server

An MCP server that helps identify train horn locations in the Harrisburg/Enola, PA area based on weather conditions, sound propagation physics, and known railroad crossing locations.

## Features

- 🎯 **Identify Horn Locations**: Determines which railroad crossings are most likely the source of a train horn you just heard
- 🌡️ **Weather-Based Analysis**: Uses real-time weather (temperature, humidity, wind) to calculate sound propagation
- 🚆 **Amtrak Schedule**: Shows current Amtrak trains passing through Harrisburg
- 📝 **Observation Logging**: Track when you hear horns to identify patterns over time
- 🛤️ **Crossing Database**: Maintains locations of major crossings near Camp Hill, PA

## Installation

1. Create a new directory for the project:
```bash
mkdir train-horn-tracker-mcp
cd train-horn-tracker-mcp
```

2. Copy the files:
   - Save the TypeScript code as `src/index.ts`
   - Save the `package.json` 
   - Save the `tsconfig.json`

3. Install dependencies:
```bash
npm install
```

4. Build the server:
```bash
npm run build
```

## Configuration

Add this to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "train-horn-tracker": {
      "command": "node",
      "args": ["/absolute/path/to/train-horn-tracker-mcp/build/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/` with your actual path.

## Usage

After configuring, restart Claude Desktop. You can then use natural language to interact with the server:

### Example Queries

**"I just heard a train horn - where did it come from?"**
Claude will use the `identify_horn_location` tool to analyze current weather and return likely crossing locations sorted by probability.

**"What Amtrak trains are passing through Harrisburg soon?"**
Claude will check the Amtrak schedule for trains within 2 hours.

**"What are the current weather conditions?"**
Claude will fetch weather data and explain how it affects sound propagation.

**"Log this observation: Very loud horn from northwest, standard crossing pattern"**
Claude will create a timestamped log entry.

**"Show me all the railroad crossings you know about"**
Claude will list all crossings with distances and directions from Camp Hill.

**"What are the traffic patterns right now?"** or **"When is train activity busiest?"**
Claude will explain typical traffic patterns for the current time or specific time periods.

**"Tell me about the Pittsburgh Line"** or **"What is the Lurgan Branch?"**
Claude will provide detailed information about specific NS rail lines.

**"Where is milepost PT 107.5?"** or **"Locate HP 112.9"**
Claude will find the location of NS milepost references - useful when monitoring railroad radio traffic on Broadcastify.

## How It Works

### Sound Propagation Model

The server calculates sound propagation based on:

- **Temperature**: Warmer air extends range
- **Humidity**: Humid air carries sound better  
- **Wind**: Sound travels farther downwind
- **Precipitation**: Rain/snow attenuates sound
- **Base Range**: Train horns (110-120 dB) typically audible 2-4 miles

### Railroad Crossings Database

Includes major crossings in:
- **Enola Yard** - Norfolk Southern's major classification yard
- **Harrisburg waterfront** - Multiple street crossings
- **Lemoyne area** - Residential crossings
- **Mechanicsburg/Naval facility line** - Industrial branch

### FRA Horn Rules

Trains must sound horns at every public grade crossing:
- Start 15-20 seconds before the crossing
- Pattern: 2 long, 1 short, 1 long (— — - —)
- Continue until locomotive occupies crossing

## Tools Available

1. **identify_horn_location**: Find likely crossing sources
2. **get_amtrak_schedule**: Current Amtrak trains
3. **get_weather_conditions**: Weather affecting sound travel
4. **log_observation**: Record when you hear horns
5. **list_crossings**: View all known crossings

## Data Sources

- **Weather**: Open-Meteo API (free, no API key required)
- **Amtrak**: Amtraker community API
- **Crossings**: Manually curated from maps/local knowledge

## Customization

### Adding More Crossings

Edit the `RAILROAD_CROSSINGS` array in `src/index.ts`:

```typescript
{ 
  name: "Your Crossing Name", 
  lat: 40.1234, 
  lon: -76.5678, 
  line: "Railroad Name" 
},
```

### Adjusting Your Location

Change `HOME_LAT` and `HOME_LON` at the top of `src/index.ts`:

```typescript
const HOME_LAT = 40.2398;  // Your latitude
const HOME_LON = -76.9197;  // Your longitude
```

## Limitations

- **Freight trains**: No real-time tracking (not publicly available)
- **Weather accuracy**: Based on nearby station, not hyperlocal
- **Crossing database**: Not exhaustive (add more as you identify them)
- **Sound physics**: Simplified model (doesn't account for terrain, buildings)

## Future Enhancements

Potential additions:
- OpenStreetMap integration to auto-discover crossings
- Machine learning to identify patterns in your observations
- Integration with railfan forums for crowd-sourced train activity
- Audio analysis to differentiate horn types/locomotives

## Troubleshooting

**"Server not connecting"**
- Verify the path in `claude_desktop_config.json` is absolute
- Check that `build/index.js` exists (run `npm run build`)
- Restart Claude Desktop

**"No weather data"**
- Check internet connection
- Open-Meteo API may be temporarily down

**"No Amtrak trains showing"**
- Amtraker API may be down
- No trains scheduled within 2-hour window

## Contributing

This is a custom MCP server for personal use, but feel free to:
- Add more crossing locations
- Improve the sound propagation model
- Enhance weather analysis
- Add new data sources

## License

MIT

---

**Note**: This server provides estimates based on physics and weather data. Actual audibility depends on many factors including terrain, buildings, and individual hearing sensitivity.