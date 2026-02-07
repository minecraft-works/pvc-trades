@zoom @property
Feature: Zoom Distance Properties
  Property-based tests for zoom level distance thresholds
  
  Verifies that:
  - Correct zoom levels are selected based on distance
  - Threshold boundaries behave correctly
  - Zoom transitions happen at expected distances

  Background:
    Given the navigation test app is configured

  # ===========================================================================
  # Zoom Level Distance Thresholds
  # ===========================================================================
  # Thresholds: 60, 100, 300, 600, 1200 blocks

  @zoom @property @thresholds
  Scenario Outline: Correct zoom level for distance ranges
    Given the player is at (0, 0)
    And the shop is at (<shop_x>, <shop_z>)
    When I calculate the zoom level for that distance
    Then the zoom level should be <expected_zoom>

    Examples: Very close (< 60 blocks) → Zoom 5
      | shop_x | shop_z | expected_zoom |
      | 10     | 10     | 5             |
      | 30     | 30     | 5             |
      | 40     | 20     | 5             |
      | 0      | 50     | 5             |

    Examples: Close (60-100 blocks) → Zoom 4
      | shop_x | shop_z | expected_zoom |
      | 60     | 0      | 4             |
      | 70     | 30     | 4             |
      | 50     | 50     | 4             |
      | 0      | 80     | 4             |

    Examples: Near (100-300 blocks) → Zoom 3
      | shop_x | shop_z | expected_zoom |
      | 100    | 0      | 3             |
      | 150    | 100    | 3             |
      | 200    | 150    | 3             |
      | 0      | 250    | 3             |

    Examples: Medium (300-600 blocks) → Zoom 2
      | shop_x | shop_z | expected_zoom |
      | 300    | 0      | 2             |
      | 400    | 200    | 2             |
      | 350    | 350    | 2             |
      | 0      | 500    | 2             |

    Examples: Far (600-1200 blocks) → Zoom 1
      | shop_x | shop_z | expected_zoom |
      | 600    | 0      | 1             |
      | 800    | 400    | 1             |
      | 700    | 700    | 1             |
      | 0      | 1000   | 1             |

    Examples: Very far (> 1200 blocks) → Zoom 0
      | shop_x | shop_z | expected_zoom |
      | 1200   | 0      | 0             |
      | 1500   | 1000   | 0             |
      | 5000   | 5000   | 0             |
      | 10000  | 10000  | 0             |

  # ===========================================================================
  # Boundary Value Tests (Exact Thresholds)
  # ===========================================================================

  @zoom @property @boundaries
  Scenario Outline: Zoom level at exact threshold boundaries
    Given the player is at (0, 0)
    And the shop is exactly <distance> blocks away
    When I calculate the zoom level
    Then the zoom level should be <expected_zoom>

    Examples: Exact boundaries
      | distance | expected_zoom |
      | 59       | 5             |
      | 60       | 4             |
      | 61       | 4             |
      | 99       | 4             |
      | 100      | 3             |
      | 101      | 3             |
      | 299      | 3             |
      | 300      | 2             |
      | 301      | 2             |
      | 599      | 2             |
      | 600      | 1             |
      | 601      | 1             |
      | 1199     | 1             |
      | 1200     | 0             |
      | 1201     | 0             |

  # ===========================================================================
  # Nether Distance Calculation
  # ===========================================================================

  @zoom @property @nether
  Scenario Outline: Nether distances use overworld equivalent
    Given the player is in the nether at (<player_x>, <player_z>)
    And a nether shop is at (<shop_x>, <shop_z>)
    When I calculate the overworld-equivalent distance
    Then the calculated distance should be <expected_distance> blocks

    Examples: Nether to overworld conversion (×8)
      | player_x | player_z | shop_x | shop_z | expected_distance |
      | 0        | 0        | 10     | 0      | 80                |
      | 0        | 0        | 0      | 10     | 80                |
      | 0        | 0        | 100    | 0      | 800               |
      | 50       | 50       | 100    | 100    | 566               |

  @zoom @property @nether-zoom
  Scenario Outline: Nether shops get correct zoom based on overworld distance
    Given the player is at overworld (0, 0)
    And a nether shop at (<nether_x>, <nether_z>) which is (<ow_x>, <ow_z>) in overworld
    When I calculate the zoom level
    Then the zoom level should be <expected_zoom>

    Examples: Nether shop zoom levels
      | nether_x | nether_z | ow_x | ow_z | expected_zoom |
      | 5        | 5        | 40   | 40   | 5             |
      | 10       | 0        | 80   | 0    | 4             |
      | 25       | 25       | 200  | 200  | 3             |
      | 50       | 50       | 400  | 400  | 2             |
      | 100      | 100      | 800  | 800  | 1             |
      | 200      | 200      | 1600 | 1600 | 0             |

  # ===========================================================================
  # Diagonal Distance Properties
  # ===========================================================================

  @zoom @property @diagonal
  Scenario Outline: Diagonal distances calculated correctly (Pythagorean)
    Given the player is at (0, 0)
    And the shop is at (<x>, <z>)
    When I calculate the distance
    Then the distance should be approximately <expected_distance> blocks

    Examples: Pythagorean theorem
      | x    | z    | expected_distance |
      | 30   | 40   | 50                |
      | 60   | 80   | 100               |
      | 300  | 400  | 500               |
      | 600  | 800  | 1000              |
      | 100  | 100  | 141               |
      | 500  | 500  | 707               |

  # ===========================================================================
  # Zoom Level Stability
  # ===========================================================================

  @zoom @property @stability
  Scenario: Zoom level doesn't oscillate at boundaries
    Given the player is moving toward a shop
    When the player crosses the 100 block boundary multiple times
    Then the zoom level should not rapidly change
    And there should be at most 4 zoom changes

  @zoom @property @hysteresis
  Scenario Outline: Hysteresis prevents zoom flickering
    Given the current zoom level is <current_zoom>
    And the distance changes from <from_distance> to <to_distance>
    When I recalculate the zoom level
    Then the zoom should <change_or_not>

    Examples: Hysteresis behavior
      | current_zoom | from_distance | to_distance | change_or_not     |
      | 3            | 95            | 105         | change to 3       |
      | 4            | 105           | 95          | change to 4       |
      | 3            | 95            | 150         | stay at 3         |
      | 4            | 150           | 95          | change to 4       |
