@property @tooltip
Feature: Shop Tooltip Properties
  Property-based tests for proximity detection and tooltip behavior

  # ===========================================================================
  # Proximity Detection Properties
  # ===========================================================================

  @tooltip @property @proximity
  Scenario Outline: Player within threshold triggers tooltip
    Given the shop proximity threshold is 100 blocks
    And a shop is at (0, 0)
    And player position is (<player_x>, <player_z>)
    Then the player should be <in_range> of the shop

    # Distance < 100 = in range (strictly less than threshold)
    Examples: Inside threshold
      | player_x | player_z | in_range        |
      | 0        | 0        | within range    |
      | 50       | 0        | within range    |
      | 0        | 50       | within range    |
      | 70       | 70       | within range    |
      | 99       | 0        | within range    |
      | 0        | 99       | within range    |

    Examples: Outside threshold
      | player_x | player_z | in_range        |
      | 100      | 0        | outside range   |
      | 0        | 100      | outside range   |
      | 80       | 80       | outside range   |
      | 200      | 0        | outside range   |

  @tooltip @property @proximity @boundary
  Scenario Outline: Boundary conditions at exact threshold
    Given the shop proximity threshold is 100 blocks
    And a shop is at (0, 0)
    And player position is (<player_x>, <player_z>)
    Then the proximity distance should be approximately <distance> blocks
    And the player should be <in_range> of the shop

    Examples: Exact boundary values
      | player_x | player_z | distance | in_range        |
      | 99       | 0        | 99       | within range    |
      | 0        | 99       | 99       | within range    |
      | 70       | 70       | 99       | within range    |
      | 100      | 0        | 100      | outside range   |
      | 72       | 72       | 102      | outside range   |

  # ===========================================================================
  # Nearest Shop Properties
  # ===========================================================================

  @tooltip @property @nearest
  Scenario Outline: Nearest shop is correctly identified
    Given shop A is at (<shop_a_x>, <shop_a_z>)
    And shop B is at (<shop_b_x>, <shop_b_z>)
    And player position is (<player_x>, <player_z>)
    Then the nearest shop should be shop <nearest>

    Examples: Clear nearest shop
      | shop_a_x | shop_a_z | shop_b_x | shop_b_z | player_x | player_z | nearest |
      | 50       | 0        | 150      | 0        | 0        | 0        | A       |
      | 150      | 0        | 50       | 0        | 0        | 0        | B       |
      | 0        | 50       | 0        | 150      | 0        | 0        | A       |
      | 100      | 100      | 200      | 200      | 50       | 50       | A       |

  @tooltip @property @nearest @equidistant
  Scenario: Equidistant shops have deterministic selection
    Given shop A is at (99, 0)
    And shop B is at (0, 99)
    And player is at (0, 0)
    Then both shops should be at distance 99 blocks
    And a shop should be selected deterministically

  # ===========================================================================
  # Item Count Properties
  # ===========================================================================

  @tooltip @property @items
  Scenario Outline: Tooltip shows correct item count
    Given a shop has <total> items in cart
    And <completed> items are marked complete
    Then the tooltip should show <remaining> items

    Examples: Item completion math
      | total | completed | remaining |
      | 1     | 0         | 1         |
      | 3     | 0         | 3         |
      | 3     | 1         | 2         |
      | 3     | 2         | 1         |
      | 3     | 3         | 0         |
      | 5     | 2         | 3         |
      | 10    | 7         | 3         |

  @tooltip @property @items @zero
  Scenario: No tooltip when all items completed
    Given a shop has 3 items in cart
    And 3 items are marked complete
    Then the tooltip should not appear

  # ===========================================================================
  # Auto-hide Timer Properties
  # ===========================================================================

  @tooltip @property @timer
  Scenario Outline: Tooltip hides after configured delay
    Given the tooltip auto-hide delay is <delay> seconds
    When the tooltip appears
    And <elapsed> seconds elapse
    Then the tooltip should be <state>

    Examples: Timer states
      | delay | elapsed | state   |
      | 4     | 0       | visible |
      | 4     | 2       | visible |
      | 4     | 3       | visible |
      | 4     | 4       | hidden  |
      | 4     | 5       | hidden  |
