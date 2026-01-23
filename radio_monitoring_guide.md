# Railroad Radio Monitoring Quick Reference

## Using ChooChooMCP with Broadcastify

This guide helps you connect what you hear on the NS Harrisburg Terminal radio feed with the MCP server's capabilities.

### Common Radio Traffic You'll Hear

**Dispatcher Communications:**
- Trains requesting permission to enter interlockings
- Milepost references: "PT 107.5", "HP 112.9", "BR 306.2", etc.
- Interlocking names: "HARRISBURG", "ROCKVILLE", "MARY", "BANKS", "PAXTON"
- Track warrants and movement authorities
- Fuel pad operations

### How to Use the MCP Server While Monitoring

#### When You Hear a Milepost Reference

**Radio:** "NS 123 approaching PT 107.5"

**Ask Claude:** "Where is milepost PT 107.5?"

**Result:** You'll learn it's the Harrisburg Fuel Pad, 2.9 miles from you at bearing 290° (WNW)

---

#### When You Hear an Interlocking Name

**Radio:** "NS 456 requesting permission to enter MARY"

**Ask Claude:** "Where is the MARY interlocking?" or "Tell me about MARY"

**Result:** Learn it's at EP 73.7/PT 110.9, the Enola Yard connection to the Pittsburgh Line, 3.1 miles NNW

---

#### When You Hear a Train Horn

**Situation:** You hear a horn and the radio says "NS 789 at ROCKVILLE"

**Ask Claude:** "I just heard a train horn" 

**Then:** "Where is ROCKVILLE?"

**Result:** Confirm the horn matches the 🔀 ROCKVILLE interlocking location (3.2 mi NNW)

---

#### Understanding Traffic Patterns

**Radio:** Hearing lots of traffic at 2 AM

**Ask Claude:** "What are the traffic patterns right now?" or "What's typical for early morning?"

**Result:** Learn that early morning (12am-6am) is peak freight movement with high activity at Enola Yard and MARY/BANKS interlockings

---

#### Learning About Rail Lines

**Radio:** "Train on the Lurgan Branch at LG 15"

**Ask Claude:** "What is the Lurgan Branch?" or "Explain the Lurgan Branch"

**Result:** Learn it runs from Lee's Cross Roads (LG 36.3) to Paxton (LG 0.0) and serves Naval Support Activity Mechanicsburg

---

## NS Harrisburg Terminal Rail Lines

| Line | Code | Key Points |
|------|------|------------|
| **Pittsburgh Line** | PT | Major east-west mainline, Amtrak Pennsylvanian |
| **Buffalo Line** | BR | North Ferry to Rockville junction |
| **Harrisburg Line** | HP | Burke to Harrisburg, Amtrak Keystone Corridor |
| **Lurgan Branch** | LG | Shippensburg area to Paxton, Naval traffic |
| **Port Road Branch** | EP | Enola Yard to Pittsburgh Line connections |
| **Royalton Branch** | RY | Royalton to Paxton |
| **Rutherford Industrial** | RIT | Container/intermodal yard |
| **Steelton Industrial** | SIT | Harrisburg to Steelton |

## Key Interlockings to Know

| Name | Location | Significance |
|------|----------|--------------|
| **HARRISBURG** | HP 112.9 / PT 105.1 | NS/Amtrak interchange, Harris Tower |
| **ROCKVILLE** | PT 109.9 / BR 306.2 | Pittsburgh/Buffalo Line junction |
| **MARY** | EP 73.7 / PT 110.9 | Enola to Pittsburgh Line |
| **BANKS** | EP 76.1 / PT 113.2 | Enola to Pittsburgh Line |
| **PAXTON** | LG 0.0 / RY 21.9 | Lurgan/Royalton junction |
| **RUTH** | HP 108.8 | Rutherford Yard access |
| **BEAVER** | HP 105.0 | Rutherford Yard access |

## Typical Radio Scenarios

### Scenario 1: Eastbound Freight from Enola
```
Radio: "Dispatcher to NS 234, you're clear MARY to HARRISBURG"
You: Hear horn blasts
Ask: "I heard a horn - where did it come from?"
Claude: Identifies MARY interlocking (3.1 mi NNW) as most likely source
```

### Scenario 2: Amtrak Keystone Service
```
Radio: "Amtrak 664 approaching HARRISBURG"
You: Hear passenger train horn pattern
Ask: "What Amtrak trains are coming?"
Claude: Shows Keystone #664 Philadelphia→Harrisburg arriving in 5 minutes
```

### Scenario 3: Yard Switching at Enola
```
Radio: Multiple calls about moves at ROCKVILLE
Time: 3:00 AM
You: Hear repeated horns from the north
Ask: "What's the traffic pattern for early morning?"
Claude: Explains peak freight/yard activity at Enola, MARY/BANKS
```

### Scenario 4: Unknown Milepost Reference
```
Radio: "NS 567 holding at PT 109.9"
Ask: "Where is milepost PT 109.9?"
Claude: ROCKVILLE interlocking, 3.2 miles NNW
You: Now know to expect possible horn activity from that direction
```

## Tips for Radio + MCP Integration

1. **Keep Claude open while monitoring** - Quick queries help you understand what's happening
2. **Log observations** - "Log this: Heard horn at 2:15 AM, radio said NS 345 at MARY"
3. **Learn the geography** - Use "list crossings" to build mental map
4. **Understand patterns** - Check "traffic patterns" to know what's normal for the time
5. **Decode references** - Use "locate milepost" for unfamiliar locations mentioned on radio

## Broadcastify Feed Information

**NS Harrisburg Terminal Feed:**
- Covers 8 rail lines in the Harrisburg/Enola area
- Monitors dispatcher communications with trains
- Includes Enola Yard operations, interlocking movements, and Amtrak coordination
- Best for understanding freight movements (passenger trains are more predictable)

## Next Steps

1. Start monitoring the Broadcastify feed
2. Keep Claude Desktop open with ChooChooMCP enabled
3. When you hear a milepost or interlocking name, ask Claude to locate it
4. When you hear a horn, use "identify_horn_location" to correlate with radio traffic
5. Build your knowledge of the rail network over time

---

**Remember:** The radio provides real-time train movements, while the MCP server helps you translate that into physical locations and understand the operational context. Together, they give you a complete picture of railroad activity around Camp Hill!