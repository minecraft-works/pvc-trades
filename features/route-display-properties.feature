@property @route
Feature: Route Display Properties
  Property-based tests for route coordinate conversion, distance calculation,
  and optimization algorithms

  # ===========================================================================
  # Coordinate Conversion Properties
  # ===========================================================================

  @route @property @coordinates
  Scenario Outline: Nether to overworld coordinate conversion
    Given a nether coordinate (<nether_x>, <nether_z>)
    Then the overworld equivalent should be (<overworld_x>, <overworld_z>)

    # Nether coords × 8 = overworld equivalent
    Examples: Basic conversions
      | nether_x | nether_z | overworld_x | overworld_z |
      | 0        | 0        | 0           | 0           |
      | 100      | 50       | 800         | 400         |
      | -100     | -50      | -800        | -400        |
      | 1        | 1        | 8           | 8           |

    Examples: Large coordinates
      | nether_x | nether_z | overworld_x | overworld_z |
      | 1000     | 1000     | 8000        | 8000        |
      | -500     | 250      | -4000       | 2000        |

  @route @property @coordinates
  Scenario Outline: Overworld to nether coordinate conversion
    Given an overworld coordinate (<overworld_x>, <overworld_z>)
    Then the nether equivalent should be (<nether_x>, <nether_z>)

    # Overworld coords ÷ 8 = nether equivalent
    Examples: Basic conversions
      | overworld_x | overworld_z | nether_x | nether_z |
      | 0           | 0           | 0        | 0        |
      | 800         | 400         | 100      | 50       |
      | -800        | -400        | -100     | -50      |
      | 8           | 8           | 1        | 1        |

    Examples: Non-divisible coordinates (floor division)
      | overworld_x | overworld_z | nether_x | nether_z |
      | 10          | 15          | 1        | 1        |
      | 7           | 7           | 0        | 0        |

  # ===========================================================================
  # Route Distance Properties
  # ===========================================================================

  @route @property @distance
  Scenario Outline: Distance between same-world shops
    Given a shop at (<x1>, <z1>) in <world>
    And another shop at (<x2>, <z2>) in <world>
    Then the route distance should be approximately <expected> blocks

    Examples: Overworld distances
      | x1   | z1   | x2   | z2   | world     | expected |
      | 0    | 0    | 100  | 0    | overworld | 100      |
      | 0    | 0    | 0    | 100  | overworld | 100      |
      | 0    | 0    | 100  | 100  | overworld | 141      |
      | 100  | 200  | 400  | 600  | overworld | 500      |

    Examples: Nether distances (in overworld-equivalent)
      | x1   | z1   | x2   | z2   | world      | expected |
      | 0    | 0    | 100  | 0    | the_nether | 800      |
      | 0    | 0    | 0    | 100  | the_nether | 800      |

  @route @property @distance
  Scenario Outline: Distance between cross-world shops
    Given a shop at (<x1>, <z1>) in <world1>
    And another shop at (<x2>, <z2>) in <world2>
    Then the route distance should be approximately <expected> blocks

    # Cross-world: convert both to overworld-equivalent
    Examples: Overworld to nether
      | x1   | z1   | x2   | z2   | world1    | world2     | expected |
      | 0    | 0    | 0    | 0    | overworld | the_nether | 0        |
      | 800  | 0    | 100  | 0    | overworld | the_nether | 0        |
      | 0    | 0    | 100  | 0    | overworld | the_nether | 800      |

  @route @property @distance @zero
  Scenario: Zero distance when same location
    Given a shop at (500, 500) in overworld
    And another shop at (500, 500) in overworld
    Then the route distance should be approximately 0 blocks

  # ===========================================================================
  # Nether Travel Savings Properties
  # ===========================================================================

  @route @property @nether-travel
  Scenario Outline: Nether travel is 8x faster for long distances
    Given I travel from (<start_x>, 0) to (<end_x>, 0) in overworld
    Then the overworld distance is <overworld_dist> blocks
    And the nether equivalent distance is <nether_dist> blocks

    Examples: Travel savings
      | start_x | end_x | overworld_dist | nether_dist |
      | 0       | 800   | 800            | 100         |
      | 0       | 1600  | 1600           | 200         |
      | -400    | 400   | 800            | 100         |

  # ===========================================================================
  # Route Optimization Properties
  # ===========================================================================

  @route @property @optimization
  Scenario Outline: Two-stop route is always reversible
    Given shops at (<x1>, <z1>) and (<x2>, <z2>) in overworld
    When the route is calculated from origin (0, 0)
    Then the total distance visiting both should be <total> blocks

    # Distance = origin->first + first->second
    Examples: Simple routes
      | x1   | z1   | x2   | z2   | total |
      | 100  | 0    | 200  | 0    | 200   |
      | 0    | 100  | 0    | 200  | 200   |

  @route @property @optimization @nearest
  Scenario Outline: Nearest neighbor visits closer shop first
    Given origin at (0, 0)
    And a shop at (<near_x>, <near_z>) overworld
    And a shop at (<far_x>, <far_z>) overworld
    When calculating nearest-neighbor route
    Then the first stop should be the closer shop

    Examples: Distance ordering
      | near_x | near_z | far_x | far_z |
      | 50     | 0      | 200   | 0     |
      | 0      | 30     | 0     | 150   |
      | 10     | 10     | 100   | 100   |

  # ===========================================================================
  # Timeline Display Properties
  # ===========================================================================

  @route @property @timeline
  Scenario Outline: Stop numbers are sequential
    Given a route with <count> stops
    Then stop numbers should be 1 through <count>

    Examples: Various route sizes
      | count |
      | 1     |
      | 2     |
      | 3     |
      | 5     |
      | 10    |

  @route @property @timeline @coordinates
  Scenario Outline: Timeline shows both coordinate systems
    Given a shop at (<primary_x>, <primary_z>) in <world>
    Then the primary display should show "<primary_display>"
    And the secondary display should show "<secondary_display>"

    Examples: Overworld shop display
      | world     | primary_x | primary_z | primary_display | secondary_display |
      | overworld | 800       | 400       | 800, 400        | 100, 50           |
      | overworld | 0         | 0         | 0, 0            | 0, 0              |

    Examples: Nether shop display
      | world      | primary_x | primary_z | primary_display | secondary_display |
      | the_nether | 100       | 50        | 100, 50         | 800, 400          |
