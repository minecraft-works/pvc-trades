@property @refresh
Feature: Data Refresh Properties
  Property-based tests for state preservation and filtering during refresh

  # ===========================================================================
  # Trade Count Properties
  # ===========================================================================

  @refresh @property @count
  Scenario Outline: Total trades after refresh is additive
    Given there are <initial> trades
    When <new_count> new trades are added
    Then total trades should be <total>

    Examples: Trade additions
      | initial | new_count | total |
      | 0       | 1         | 1     |
      | 5       | 0         | 5     |
      | 5       | 1         | 6     |
      | 5       | 2         | 7     |
      | 10      | 5         | 15    |
      | 100     | 10        | 110   |

  @refresh @property @count @removal
  Scenario Outline: Trades can be removed during refresh
    Given there are <initial> trades
    When <removed> trades are removed
    Then total trades should be <total>

    Examples: Trade removals
      | initial | removed | total |
      | 5       | 0       | 5     |
      | 5       | 1       | 4     |
      | 5       | 5       | 0     |
      | 10      | 3       | 7     |

  # ===========================================================================
  # Highlight Properties
  # ===========================================================================

  @refresh @property @highlight
  Scenario Outline: New trades are highlighted
    Given there are <initial> trades
    When <new_count> new trades are added
    Then <new_count> trades should be highlighted

    Examples: Highlight counts
      | initial | new_count |
      | 5       | 1         |
      | 5       | 3         |
      | 10      | 5         |
      | 0       | 10        |

  @refresh @property @highlight @persistence
  Scenario Outline: Highlights persist until page refresh
    Given <highlighted> trades are highlighted
    When <seconds> seconds pass without page refresh
    Then <highlighted> trades should still be highlighted

    Examples: Persistence over time
      | highlighted | seconds |
      | 1           | 5       |
      | 3           | 10      |
      | 5           | 30      |

  # ===========================================================================
  # Filter Preservation Properties
  # ===========================================================================

  @refresh @property @filter
  Scenario Outline: Search filter hides non-matching new trades
    Given a search filter for "<search_term>"
    When a new trade for "<item>" is added
    Then the new trade should be <visibility>

    Examples: Filter matching
      | search_term | item           | visibility |
      | diamond     | Diamond Block  | visible    |
      | diamond     | Diamond Sword  | visible    |
      | diamond     | Coal Block     | hidden     |
      | blaze       | Blaze Rod      | visible    |
      | blaze       | Diamond        | hidden     |

  @refresh @property @filter @case
  Scenario Outline: Search filter is case insensitive
    Given a search filter for "<search_term>"
    When a new trade for "<item>" is added
    Then the new trade should be <visibility>

    Examples: Case insensitive matching
      | search_term | item           | visibility |
      | DIAMOND     | diamond block  | visible    |
      | diamond     | DIAMOND BLOCK  | visible    |
      | Diamond     | DiAmOnD BlOcK  | visible    |

  # ===========================================================================
  # Cart Preservation Properties
  # ===========================================================================

  @refresh @property @cart
  Scenario Outline: Cart is preserved across refresh
    Given <cart_count> items in cart
    When data refreshes
    Then cart should have <cart_count> items

    Examples: Cart preservation
      | cart_count |
      | 0          |
      | 1          |
      | 3          |
      | 5          |
      | 10         |

  @refresh @property @cart @quantities
  Scenario Outline: Cart quantities preserved across refresh
    Given an item with quantity <quantity> in cart
    When data refreshes
    Then the item should have quantity <quantity>

    Examples: Quantity preservation
      | quantity |
      | 1        |
      | 5        |
      | 10       |
      | 64       |
      | 100      |

  # ===========================================================================
  # Error Handling Properties
  # ===========================================================================

  @refresh @property @error
  Scenario Outline: Failed refresh preserves existing data
    Given there are <initial> trades
    When refresh fails with error
    Then <initial> trades should still be visible
    And no error UI should be shown

    Examples: Error recovery
      | initial |
      | 5       |
      | 10      |
      | 50      |
