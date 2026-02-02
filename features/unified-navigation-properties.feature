@property @unified
Feature: Unified Navigation Properties
  Property-based tests for nether marker positioning, player positioning,
  and coordinate consistency across dimensions

  # ===========================================================================
  # Nether Marker Positioning Properties
  # ===========================================================================

  @unified @property @nether-marker
  Scenario Outline: Nether shop markers positioned at overworld-equivalent
    Given a nether shop at (<nether_x>, <nether_z>)
    Then the marker should be positioned at (<marker_x>, <marker_z>)

    # Nether coords × 8 = overworld-equivalent marker position
    Examples: Basic positions
      | nether_x | nether_z | marker_x | marker_z |
      | 0        | 0        | 0        | 0        |
      | 100      | 50       | 800      | 400      |
      | -100     | -50      | -800     | -400     |
      | 25       | 25       | 200      | 200      |

    Examples: Large nether coordinates
      | nether_x | nether_z | marker_x | marker_z |
      | 500      | 500      | 4000     | 4000     |
      | -250     | 125      | -2000    | 1000     |

  @unified @property @nether-marker
  Scenario Outline: Overworld shop markers at actual coordinates
    Given an overworld shop at (<x>, <z>)
    Then the marker should be positioned at (<x>, <z>)

    Examples: Overworld positions unchanged
      | x      | z      |
      | 0      | 0      |
      | 100    | 200    |
      | -500   | -300   |
      | 1000   | -1000  |

  # ===========================================================================
  # Player Positioning Properties
  # ===========================================================================

  @unified @property @player-position
  Scenario Outline: Overworld player shows at actual coordinates
    Given the player is in overworld at (<x>, <z>)
    Then the player marker should be at (<marker_x>, <marker_z>)

    Examples: Overworld player positions
      | x      | z      | marker_x | marker_z |
      | 0      | 0      | 0        | 0        |
      | 500    | 300    | 500      | 300      |
      | -200   | 400    | -200     | 400      |

  @unified @property @player-position @nether
  Scenario Outline: Nether player shows at overworld-equivalent
    Given the player is in the_nether at (<nether_x>, <nether_z>)
    Then the player marker should be at (<marker_x>, <marker_z>)

    # Player in nether: coords × 8 for unified map
    Examples: Nether player positions
      | nether_x | nether_z | marker_x | marker_z |
      | 0        | 0        | 0        | 0        |
      | 100      | 50       | 800      | 400      |
      | -50      | 25       | -400     | 200      |

  # ===========================================================================
  # Coordinate Consistency Properties
  # ===========================================================================

  @unified @property @consistency
  Scenario Outline: Same physical location shows at same marker position
    Given an overworld shop at (<ow_x>, <ow_z>)
    And a nether shop at (<nether_x>, <nether_z>)
    When both are at the same physical location
    Then both markers should be at (<marker_x>, <marker_z>)

    # Overworld (800, 400) ≡ Nether (100, 50)
    Examples: Equivalent locations
      | ow_x   | ow_z   | nether_x | nether_z | marker_x | marker_z |
      | 800    | 400    | 100      | 50       | 800      | 400      |
      | 0      | 0      | 0        | 0        | 0        | 0        |
      | -1600  | 800    | -200     | 100      | -1600    | 800      |

  @unified @property @consistency @bidirectional
  Scenario Outline: Coordinate conversion is reversible
    Given nether coordinates (<nether_x>, <nether_z>)
    Then converting to overworld gives (<ow_x>, <ow_z>)
    And converting back to nether gives (<nether_x>, <nether_z>)

    Examples: Reversible conversions
      | nether_x | nether_z | ow_x   | ow_z   |
      | 100      | 50       | 800    | 400    |
      | 0        | 0        | 0      | 0      |
      | -125     | 250      | -1000  | 2000   |

  # ===========================================================================
  # Distance Consistency Properties
  # ===========================================================================

  @unified @property @distance-consistency
  Scenario Outline: Distance is same regardless of calculation direction
    Given shop A at (<x1>, <z1>) in <world1>
    And shop B at (<x2>, <z2>) in <world2>
    Then distance A to B should equal distance B to A

    Examples: Symmetric distances
      | x1   | z1   | world1    | x2   | z2   | world2     |
      | 0    | 0    | overworld | 100  | 100  | overworld  |
      | 0    | 0    | overworld | 100  | 0    | the_nether |
      | 50   | 50   | the_nether| 100  | 100  | the_nether |

  # ===========================================================================
  # Tile Consistency Properties
  # ===========================================================================

  @unified @property @tiles
  Scenario Outline: Only overworld tiles loaded regardless of player world
    Given the player is in <world> at (<x>, <z>)
    Then the tile layer should be "overworld"
    And no nether tiles should be loaded

    Examples: Player in different worlds
      | world      | x    | z    |
      | overworld  | 0    | 0    |
      | overworld  | 500  | 300  |
      | the_nether | 100  | 50   |
      | the_nether | -50  | 25   |

  # ===========================================================================
  # Boundary Properties
  # ===========================================================================

  @unified @property @boundary
  Scenario Outline: Extreme nether coordinates map correctly
    Given a nether shop at (<nether_x>, <nether_z>)
    Then the marker should be positioned at (<marker_x>, <marker_z>)

    Examples: World boundary values
      | nether_x | nether_z | marker_x  | marker_z  |
      | 3750     | 3750     | 30000     | 30000     |
      | -3750    | -3750    | -30000    | -30000    |
      | 0        | 3750     | 0         | 30000     |
