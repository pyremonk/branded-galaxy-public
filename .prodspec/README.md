# ProdSpec Configuration

This project uses ProdSpec (Product Specificator) for spec-driven development workflow.

## Directory Structure

```
.prodspec/
├── README.md
├── product/
│   ├── feature-catalog.md   # Record of all features with implementation status
│   └── roadmap.md           # Planned features and known gaps
└── specs/
    ├── galaxy-map-systems/          # Specs 001–004
    ├── faction-management/          # Specs 005–008
    ├── character-leader-system/     # Specs 009–012
    ├── fleet-management-combat/     # Specs 013–016
    ├── base-construction-facilities/# Specs 017–020
    ├── mission-system/              # Specs 021–023
    ├── diplomacy-planet-loyalty/    # Specs 024–027
    ├── turn-based-game-loop/        # Specs 028–031
    ├── ai-opponents/                # Specs 032–033
    ├── user-interface-controls/     # Specs 034–036
    ├── game-setup-configuration/    # Specs 037–039
    ├── save-load-system/            # Specs 040–041
    ├── intelligence-fog-of-war/     # Specs 042–044
    ├── event-system/                # Spec  045
    ├── combat-resolution-system/    # Specs 046–048
    ├── multiplayer-networking/      # Specs 049–050
    ├── audio-visual-presentation/   # Specs 051–052
    ├── tutorial-help-system/        # Specs 053–054
    ├── hybrid-async-sync-mode/      # Specs 055–062
    └── archive/
        └── plans/           # Archived plan files (historical reference)
```

### Spec File Naming Convention

Spec files are organized into **category subfolders** that match the sections in `feature-catalog.md`. Each spec file keeps its 3-digit number prefix for global cross-referencing:

```
.prodspec/specs/{category}/{NNN}-{feature-name}-spec.md
```

- **`{category}`** — Kebab-case folder name matching a feature catalog section (see table above)
- **`{NNN}`** — Zero-padded three-digit number representing the feature's position in the feature catalog, ordered sequentially by sub-feature appearance (e.g. `001`, `002`, `014`)
- **`{feature-name}`** — Kebab-case feature name matching the catalog entry

**Example**: `.prodspec/specs/faction-management/007-technology-research-tree-spec.md`

**For new features not yet in the catalog**: Use the next available number after the current last catalog entry, place the spec in the matching category folder (or a new folder for a new category), then add the feature to `feature-catalog.md`.

## Workflow

1. **Write Spec**: Create `.prodspec/specs/{category}/{NNN}-{feature-name}-spec.md` with requirements, constraints, and acceptance criteria
2. **Run Plan Mode**: Open a Plan mode session referencing the spec — no `plan.md` file is created; the plan exists only for the duration of the session
3. **Implement**: Execute the plan with the spec as the requirements reference
4. **Synchronize**: Update the spec, `feature-catalog.md`, `roadmap.md`, and `README.md` to reflect what was built

> **Note**: Plan mode sessions replace the old `plan.md` files. Plans are ephemeral — they exist only during the Plan mode session and are not persisted.

## Spec Template

```markdown
# Feature Name

## Overview
Brief description of the feature

## Requirements
- Requirement 1
- Requirement 2

## Constraints
- Constraint 1
- Constraint 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

## Benefits

- Clear documentation of intent before implementation
- Numbered specs mirror catalog order — easy to find and cross-reference
- Plan mode keeps implementation plans flexible without cluttering the repo
- AI-friendly development workflow

### Example Spec Template

```markdown
# Feature Name

## Overview
Brief description of the feature

## Requirements
- Requirement 1
- Requirement 2

## Constraints
- Constraint 1
- Constraint 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

### Example Plan Template

```markdown
# Feature Name - Technical Implementation Plan

## Architecture Overview
High-level architecture and design approach

## Technical Approach
- Component/module structure
- Data flow and state management
- Integration points with existing code

## Implementation Strategy
1. Phase 1: Foundation
   - Key components to build first
   - Dependencies to set up

2. Phase 2: Core Features
   - Main functionality implementation
   - API/interface design

3. Phase 3: Integration & Polish
   - Connect with existing systems
   - Error handling and edge cases

## Technical Decisions
- **Decision 1**: Rationale and trade-offs
- **Decision 2**: Rationale and trade-offs

## Dependencies
- External libraries or services needed
- Other features or systems this depends on

## Testing Approach
- Unit testing strategy
- Integration testing considerations
- Manual testing checklist

## Implementation Tasks

### Phase 1: Foundation
**Goal**: Establish core infrastructure

- [ ] Task 1 - Detailed description
- [ ] Task 2 - Detailed description

### Phase 2: Core Features
**Goal**: Implement main functionality

- [ ] Task 3 - Detailed description
- [ ] Task 4 - Detailed description

### Phase 3: Integration & Polish
**Goal**: Connect systems and refine

- [ ] Task 5 - Detailed description
- [ ] Task 6 - Detailed description

**Notes**:
- Track progress by checking off tasks as completed
- Tasks should align with phases in Implementation Strategy
```

## Benefits

- Clear documentation of intent before implementation
- Structured approach to feature development
- Better collaboration between team members
- AI-friendly development workflow
