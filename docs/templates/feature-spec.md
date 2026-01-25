# Feature Specification Template

Use this template when specifying new features for implementation.

---

## Feature: [Feature Name]

### Overview
Brief description of the feature and its purpose.

### User Story
As a [type of user],
I want [some goal],
So that [some reason/benefit].

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

### Technical Requirements

#### Files to Modify
| File | Change Type | Description |
|------|-------------|-------------|
| `src/main.ts` | Modify | Add event handler for X |
| `src/library.ts` | Add | New pure function for Y |
| `src/types.ts` | Add | New type definition |
| `features/X.feature` | Add | BDD scenarios |

#### State Changes
- New state variable: `stateVar: Type` - purpose
- localStorage key: `key-name` - what it stores

#### API Dependencies
- Endpoint: `GET /api/endpoint`
- Schema: Reference to Zod schema in types.ts

### UI/UX Specification

#### Desktop View
- Describe layout
- Describe interactions

#### Mobile View
- Describe responsive behavior
- Touch interactions

### Edge Cases
1. What if X is empty?
2. What if Y fails?
3. What if user navigates away?

### Performance Considerations
- Impact on bundle size
- Lazy loading requirements
- Caching strategy

### Testing Requirements

#### Unit Tests (`src/*.test.ts`)
```typescript
describe('featureName', () => {
    test('should handle normal case', () => {
        // Test implementation
    });
    
    test('should handle edge case', () => {
        // Test implementation
    });
});
```

#### BDD Scenarios (`features/X.feature`)
```gherkin
@feature-tag
Feature: Feature Name
  
  Scenario: Happy path
    Given initial state
    When action is performed
    Then expected result

  Scenario: Error handling
    Given error condition
    When action is performed
    Then graceful error handling
```

### Implementation Notes
- Specific technical details
- Dependencies to install
- Breaking changes

### Related Documentation
- Link to design doc
- Link to ADR
- Link to external API docs

---

## Example: Add Shop Favorites

### Overview
Allow users to mark shops as favorites for quick access.

### User Story
As a trader,
I want to mark shops as favorites,
So that I can quickly find my preferred trading locations.

### Acceptance Criteria
- [ ] User can click a star icon to favorite a shop
- [ ] Favorites persist across sessions
- [ ] Favorites appear at top of search results when filter is enabled
- [ ] User can view list of all favorites

### Technical Requirements

#### Files to Modify
| File | Change Type | Description |
|------|-------------|-------------|
| `src/main.ts` | Modify | Add favorite toggle handler |
| `src/library.ts` | Add | `isFavorite()`, `sortWithFavorites()` |
| `src/types.ts` | Add | `FavoriteStore` type |
| `styles.css` | Modify | Star icon styling |
| `features/favorites.feature` | Add | BDD scenarios |

#### State Changes
- New state: `favorites: Set<string>` - shop coordinates as keys
- localStorage key: `pvc-trades-favorites` - serialized array of shop keys

### UI/UX Specification

#### Desktop View
- Star icon in each trade row
- Filled star = favorited, outline = not favorited
- Click to toggle

#### Mobile View
- Same behavior, larger touch target

### Edge Cases
1. What if localStorage is full? → Silent fail, don't block usage
2. What if shop no longer exists? → Remove from favorites on next load

### Testing Requirements

#### BDD Scenarios
```gherkin
@favorites
Feature: Shop Favorites
  
  Scenario: Favorite a shop
    Given the app is loaded with mock shop data
    When I click the favorite star on a trade
    Then the star should be filled
    And the shop should persist in favorites

  Scenario: Filter by favorites
    Given I have favorited shops
    When I enable the favorites filter
    Then only favorited shops should appear
```
