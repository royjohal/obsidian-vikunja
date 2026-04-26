# Testing

This project includes comprehensive automated tests using [Vitest](https://vitest.dev/).

## Running Tests

### Run all tests
```bash
npm test
```

### Watch mode (re-run on file changes)
```bash
npm test
# Tests will re-run automatically when you change code
# Press 'q' to quit watch mode
```

### Run tests once (CI mode)
```bash
npm test -- --run
```

### View test UI
```bash
npm test:ui
```

Opens an interactive dashboard in your browser showing:
- Test results and status
- Code coverage
- Test execution timeline
- Detailed failure information

### Generate coverage report
```bash
npm test:coverage
```

Generates an HTML coverage report in `coverage/` with detailed line-by-line coverage analysis.

## Test Structure

Tests are colocated with source files using the `.test.ts` suffix:

```
src/
  sync/
    TaskParser.ts          # Implementation
    TaskParser.test.ts     # Tests
    SyncEngine.ts          # Implementation
    DeletionSafeguards.test.ts  # Tests (conceptual safeguards)
```

## Test Suites

### TaskParser Tests (27 tests)

Comprehensive coverage of markdown task parsing:

- **Basic parsing**: incomplete tasks, completed tasks, bullet styles
- **Metadata extraction**: due dates (📅), start dates (🛫), scheduled dates (⏳), priority emojis
- **Advanced features**: recurrence patterns (🔁), inline project routing (@project:Name)
- **Tracking IDs**: both `%%vikunja:ID%%` and legacy `<!--vikunja:ID-->` formats
- **Title cleaning**: stripping metadata tokens, handling Tasks plugin tokens
- **Serialization**: roundtrip parse → edit → serialize consistency
- **Recurrence conversion**: human-readable ↔ seconds (for Vikunja API)

**Key test scenarios:**
```bash
npm test -- TaskParser
```

### Deletion Safeguards Tests (20 tests)

Critical safety mechanisms preventing data loss:

- **Empty file check**: prevents deletion when project file hasn't been populated yet
  - Catches first-sync scenario where Vikunja tasks would be deleted
  
- **50% threshold check**: prevents deletion if >50% of tasks would be deleted
  - Catches broken sync where task IDs don't match
  - Example: 45 tasks in Obsidian, 100 in Vikunja → skip deletion
  
- **Real-world scenarios**: 
  - Safe cleanup of a few deleted tasks
  - Broken integration detection
  - Accidental file clearing
  - Large-scale operations

**Key test scenarios:**
```bash
npm test -- DeletionSafeguards
```

These tests simulate the safeguard logic and verify it catches dangerous scenarios while allowing safe operations.

## Why Tests Matter

After the data loss incident (45 tasks deleted), tests provide:

1. **Regression prevention** — Ensure the deletion safeguards actually work
2. **Confidence** — Safe to refactor knowing tests will catch breaks
3. **Documentation** — Tests show how features are supposed to work
4. **Collaboration** — Team can confidently review and modify code

## Writing New Tests

When adding features, add tests alongside:

```typescript
import { describe, it, expect } from 'vitest';
import { YourModule } from './YourModule';

describe('YourModule', () => {
  it('does the thing', () => {
    const result = YourModule.method(input);
    expect(result).toBe(expectedOutput);
  });
});
```

## Coverage Goals

- **TaskParser**: 95%+ — core parsing logic is critical
- **DeletionSafeguards**: 100% — safety logic must be bulletproof
- **SyncEngine**: Integration tests planned for v0.2

Current coverage: Check with `npm test:coverage`

## CI Integration

Tests run automatically in GitHub Actions on every push. See `.github/workflows/` for configuration.

If tests fail in CI but pass locally, check:
- Node.js version (requires 18+)
- Line endings (git might auto-convert on Windows)
- Timezone-dependent tests (none currently, but watch for this)
