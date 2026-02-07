@navigation @property
Feature: Live Navigation Properties
  Property-based tests for navigation calculations and player tracking
  
  Verifies mathematical correctness of:
  - Distance calculations between player and shops
  - Auto-advance threshold detection
  - Yaw to compass direction conversion
  - Route recalculation thresholds

  Background:
    Given the navigation test app is configured

  # ===========================================================================
  # Distance Calculation Properties
  # ===========================================================================

  @navigation @property @distance
  Scenario Outline: Distance calculations are correct for same-world navigation
    Given player is at (<player_x>, <player_z>) in <player_world>
    And the target shop is at (<shop_x>, <shop_z>) in <shop_world>
    Then the calculated distance should be approximately <expected_distance> blocks

    Examples: Overworld to overworld
      | player_x | player_z | player_world | shop_x | shop_z | shop_world | expected_distance |
      | 0        | 0        | overworld    | 100    | 0      | overworld  | 100               |
      | 0        | 0        | overworld    | 0      | 100    | overworld  | 100               |
      | 0        | 0        | overworld    | 100    | 100    | overworld  | 141               |
      | 100      | 100      | overworld    | 200    | 200    | overworld  | 141               |
      | -100     | -100     | overworld    | 100    | 100    | overworld  | 283               |
      | 0        | 0        | overworld    | 1000   | 0      | overworld  | 1000              |

    Examples: Nether to nether (×8 for overworld equivalent)
      | player_x | player_z | player_world | shop_x | shop_z | shop_world | expected_distance |
      | 0        | 0        | the_nether   | 100    | 0      | the_nether | 800               |
      | 0        | 0        | the_nether   | 100    | 100    | the_nether | 1131              |

    Examples: Cross-world (overworld to nether shop)
      | player_x | player_z | player_world | shop_x | shop_z | shop_world | expected_distance |
      | 0        | 0        | overworld    | 100    | 100    | the_nether | 1131              |
      | 800      | 800      | overworld    | 100    | 100    | the_nether | 0                 |

  @navigation @property @distance @zero
  Scenario: Zero distance when player is at shop location
    Given player is at (500, 300) in overworld
    And the target shop is at (500, 300) in overworld
    Then the calculated distance should be approximately 0 blocks

  # ===========================================================================
  # Auto-Advance Threshold Properties
  # ===========================================================================

  @navigation @property @auto-advance
  Scenario Outline: Auto-advance triggers at correct threshold
    Given the arrival threshold is 8 blocks
    And player is at (<player_x>, <player_z>) in overworld
    And the target shop is at (<shop_x>, <shop_z>) in overworld
    Then auto-advance should <trigger>

    Examples: Within threshold (should trigger)
      | player_x | player_z | shop_x | shop_z | trigger     |
      | 100      | 200      | 100    | 200    | trigger     |
      | 100      | 200      | 103    | 204    | trigger     |
      | 100      | 200      | 107    | 200    | trigger     |
      | 100      | 200      | 100    | 207    | trigger     |

    Examples: Outside threshold (should not trigger)
      | player_x | player_z | shop_x | shop_z | trigger     |
      | 100      | 200      | 109    | 200    | not trigger |
      | 100      | 200      | 100    | 209    | not trigger |
      | 100      | 200      | 106    | 206    | not trigger |
      | 0        | 0        | 100    | 200    | not trigger |

  @navigation @property @auto-advance @boundary
  Scenario Outline: Auto-advance boundary conditions
    Given the arrival threshold is 8 blocks
    And player is at (0, 0) in overworld
    And the target shop is at (<x>, <z>) in overworld
    Then auto-advance should <trigger>

    Examples: Exactly at and just beyond threshold
      | x   | z   | trigger     |
      | 7   | 0   | trigger     |
      | 8   | 0   | not trigger |
      | 0   | 7   | trigger     |
      | 0   | 8   | not trigger |
      | 5   | 5   | trigger     |
      | 6   | 6   | not trigger |

  # ===========================================================================
  # Yaw to Direction Properties
  # ===========================================================================

  @navigation @property @direction
  Scenario Outline: Yaw converts to correct compass direction
    Given player has yaw <yaw>
    Then the compass direction should be "<direction>"

    # Minecraft yaw: 0=south, 90=west, 180/-180=north, -90=east
    Examples: Cardinal directions
      | yaw   | direction |
      | 0     | south     |
      | 90    | west      |
      | 180   | north     |
      | -180  | north     |
      | -90   | east      |

    Examples: Intermediate directions
      | yaw   | direction  |
      | 45    | southwest  |
      | 135   | northwest  |
      | -45   | southeast  |
      | -135  | northeast  |

    Examples: Edge cases
      | yaw   | direction |
      | 360   | south     |
      | -360  | south     |
      | 450   | west      |
      | -270  | west      |

  @navigation @property @direction
  Scenario Outline: Marker arrow yaw maps to direction
    Given player has yaw <yaw>
    Then the compass direction should be "<direction>"

    Examples: Arrow directions match yaw
      | yaw  | direction |
      | 0    | south     |
      | 90   | west      |
      | -90  | east      |
      | 180  | north     |

  # ===========================================================================
  # Route Recalculation Properties
  # ===========================================================================

  @navigation @property @recalculate
  Scenario Outline: Route recalculates after significant movement
    Given player started navigation at (<start_x>, <start_z>)
    And the recalculation threshold is 10 blocks
    When player position changes to (<end_x>, <end_z>)
    Then the route should <recalculate>

    Examples: Movement beyond threshold
      | start_x | start_z | end_x | end_z | recalculate     |
      | 0       | 0       | 15    | 0     | be recalculated |
      | 0       | 0       | 0     | 15    | be recalculated |
      | 0       | 0       | 10    | 10    | be recalculated |
      | 100     | 200     | 120   | 220   | be recalculated |

    Examples: Movement within threshold
      | start_x | start_z | end_x | end_z | recalculate         |
      | 0       | 0       | 5     | 0     | not be recalculated |
      | 0       | 0       | 0     | 5     | not be recalculated |
      | 0       | 0       | 3     | 3     | not be recalculated |
      | 100     | 200     | 105   | 205   | not be recalculated |

  # ===========================================================================
  # Distance Display Properties
  # ===========================================================================

  @navigation @property @display
  Scenario Outline: Distance display shows correct value
    Given player is at (<player_x>, <player_z>) in overworld
    And the target shop is at (<shop_x>, <shop_z>) in overworld
    When the distance display updates
    Then it should show "<expected>" blocks

    Examples: Various distances
      | player_x | player_z | shop_x | shop_z | expected |
      | 0        | 0        | 100    | 0      | 100      |
      | 0        | 0        | 100    | 100    | 141      |
      | 0        | 0        | 1000   | 0      | 1000     |
      | 500      | 500      | 500    | 500    | 0        |

  # ===========================================================================
  # Nether Portal Transition Properties  
  # ===========================================================================

  @navigation @property @nether-transition
  Scenario: Distance updates correctly when player enters nether
    Given player is at (800, 800) in overworld
    And the target shop is at (100, 100) in the_nether
    Then the calculated distance should be approximately 0 blocks
    When player transitions to the_nether at (100, 100)
    Then the calculated distance should be approximately 0 blocks

  @navigation @property @nether-transition
  Scenario: Distance increases when player moves away in nether
    Given player is at (100, 100) in the_nether
    And the target shop is at (100, 100) in the_nether
    Then the calculated distance should be approximately 0 blocks
    When player moves to (200, 100) in the_nether
    Then the calculated distance should be approximately 800 blocks

