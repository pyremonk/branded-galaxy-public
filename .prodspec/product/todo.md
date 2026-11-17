### Improvements
- [ ] Rearrange the topbar HUD (Resources, Alerts, Turn/Time stuff, menus)
- [ ] Add an "Extended Mission" type that calculates results every turn and asks the player if they should continue the mission (thinking of diplomacy and other long-term mission types)
- [ ] Balance economy based on time scale changes.
- [ ] Implement repo doc hygiene (See chat: "Agent workspace memory storage location")
- [ ] Mini-map should be click and draggable
  - [ ] Should have the same border as other panels
- [ ] Initiatives and turn limits don't need to display since the map filters can help find things

### Bugs
- [ ] Pinch to zoom in and out does not work on tablets
- [ ] Scroll-wheel zooming should follow mouse pointer

### New Features

### Done
- [x] Relabel "Turn" to "Month" in UI only
- [x] Update Tick to Turn rate (make 30 tick)
- [x] Balance time to complete things
- [x] Fix end of turn notices so it shows all notices for a system and moves from system to system
- [x] Fix newly constructed ships so they create a new fleet
- [x] Dynamic build buttons (disabled when there isn't enough currency/reason on hover)
- [x] Show troop reinforcement cost without hovering
- [x] Accordianify Alert Summary
  - Move from a two column display to an hierarchy/accordion driven display for each turn.
    - Turn # (expanded by default)
      - Player Faction (expanded by default)
        - Critical Successes & Successes (expanded by default)
          - Message (each message is collapsed by default)
            - Outcome details
        - Critical Failures & Failures (expanded by default)
        - Informational (expanded by default)
        - Tips (expanded by default)
      - Enemy Activity (expanded by default)
        - Critical Successes & Successes (expanded by default)
          - Message (each message is collapsed by default)
            - Outcome details
        - Critical Failures & Failures (expanded by default)
        - Informational (expanded by default)
- [x] Explainer drawer for each facility type in the build facility list
- [x] Idle facilities filter
- [x] Fix fleets with multiple stops not showing a fleet indicator when enroute
- [x] Non-hyperlane travel should be allowed (it is currently not able to be planned in the UI)
- [x] New games seem to be starting in sync mode but show as async