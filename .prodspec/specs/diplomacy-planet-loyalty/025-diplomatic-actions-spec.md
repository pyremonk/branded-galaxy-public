# Diplomatic Actions

## Overview

Diplomatic Actions are resource-spending operations that directly manipulate system loyalty or inter-faction relationships without requiring a character mission. They represent large-scale propaganda, trade negotiations, and political maneuvering. Unlike character missions, diplomatic actions are available as turn-phase actions to any faction, cost resources rather than character time, and execute immediately without a success roll. They complement the Mission System as a reliable but more expensive loyalty tool.

For The Autoforge specifically, Diplomatic Actions include the unique mechanism of Alliance Proposals — offering neutral or enemy systems a formal arrangement of mutual benefit.

## Requirements

### FR-DA-001: Propaganda Campaign
- Cost: 150 credits + 50 influence
- Target: Any system with current faction loyalty < 80
- Effect: +10 loyalty toward the purchasing faction at the target system
- Limit: One propaganda campaign per system per turn (regardless of faction)
- Propaganda campaigns from different factions on the same system in the same turn both apply (loyalty values are independent), but if two factions run campaigns on the same system-faction pair in the same turn, only the first (by turn-submission order) takes effect for that faction
- Brand Authority receives a +5% loyalty boost on propaganda (economic influence): +10.5 → rounds to 11
- Duration: Effect applies immediately at Resolution Phase; no turn duration

### FR-DA-002: Trade Agreement
- Cost: 300 credits
- Target: Any system with loyalty between 40 and 80 for the purchasing faction
- Effect: +20 loyalty toward the purchasing faction; system gains +10% resource production for 3 turns
- Limit: One Trade Agreement per system total per game (not renewable until it expires); cannot stack with another Trade Agreement in effect
- Trade Agreement visible to all factions in system tooltip (represents a public economic arrangement)

### FR-DA-003: Resource Investment
- Cost: 200 materials
- Target: Any system with loyalty ≥ 30 toward the purchasing faction
- Effect: +15 loyalty; system gains a permanent +5% materials production bonus
- Limit: Two Resource Investments per system per game
- Represents building infrastructure — the production bonus stacks with other bonuses

### FR-DA-004: Alliance Proposal (Autoforge Only)
- Available exclusively to The Autoforge faction
- Cost: 100 credits + 200 influence
- Target: Any Neutral system or system controlled by a non-Autoforge faction with loyalty < 40
- Effect on Acceptance (automatic if conditions met):
  - System loyalty toward Autoforge increases by 30
  - System gains an Outpost (treated as Autoforge facility) at no additional construction cost
  - System retains its original controlling faction's loyalty values unchanged
- Acceptance conditions (system auto-accepts if):
  - Autoforge loyalty at system < 30 (not yet aligned) AND
  - No Autoforge Fleet is present blockading the system AND
  - System does not already have an Autoforge Outpost
- On rejection (conditions not met): No effect; action is refunded
- Limit: One Alliance Proposal per system per game

### FR-DA-005: Diplomatic Action UI
- All diplomatic actions are accessible from the **System Detail** panel under a **Diplomacy** tab
- The tab shows:
  - Current loyalty values for all factions
  - Available diplomatic actions for the player's faction (grayed out if ineligible, with reason)
  - Cost preview for each action
  - History of past diplomatic actions at this system (last 5 turns)
- Diplomatic actions are confirmed with a single click-through confirmation dialog
- Actions are staged alongside missions until turn submission; they can be cancelled before submission

### FR-DA-006: Faction Diplomatic Modifiers
- From faction definitions (spec 005):
  - Brand Authority: +5% loyalty effect on Propaganda Campaigns
  - The Union: -10% cost on all Diplomatic Actions (guerrilla influence network)
  - The Autoforge: Alliance Proposals available; +10 loyalty from Trade Agreements (trade dependency)
- Modifiers read from faction config, not hardcoded

## Constraints

- Diplomatic actions must deduct resources at staging time (not at Resolution Phase) to prevent over-spending across multiple actions
- If a staged diplomatic action cannot be afforded at Resolution (e.g. resources spent by a higher-priority resolution), the action is aborted with a notification
- Alliance Proposals must construct an Outpost via the normal facility system — they do not bypass HP or network tracking

## Acceptance Criteria

- [x] Propaganda Campaign costs 150cr+50inf and applies +10 (or +11 for Brand Authority) loyalty
- [x] Only one propaganda campaign per system per turn is applied per faction
- [x] Trade Agreement applies +20 loyalty and +10% production bonus valid for 3 turns
- [x] Trade Agreement blocks a second Trade Agreement at the same system until the first expires
- [x] Resource Investment applies +15 loyalty and a permanent +5% materials bonus (stackable up to 2×)
- [x] Alliance Proposal is only available to The Autoforge and only targets eligible systems
- [x] Alliance Proposal auto-accepts correctly based on conditions and places an Outpost
- [x] Diplomacy tab in System Detail panel shows all eligible actions with costs
- [x] Resources are deducted at staging time; actions abort if resources unavailable at Resolution
- [x] Union cost discount (-10%) applies to all Diplomatic Actions
