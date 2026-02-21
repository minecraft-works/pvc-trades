@property @shop-map
Feature: Shop Map Player Properties
  Property-based tests for world filtering of player markers

  # ===========================================================================
  # World Filtering Properties
  # ===========================================================================

  @shop-map @property @world-filter
  Scenario Outline: Players filtered by world match shop world
    Given a shop in <shop_world>
    And a player in <player_world>
    Then the player should be <visibility> on the map

    Examples: Same world visibility
      | shop_world | player_world | visibility |
      | overworld  | overworld    | visible    |
      | the_nether | the_nether   | visible    |

    Examples: Different world filtering
      | shop_world | player_world | visibility |
      | overworld  | the_nether   | hidden     |
      | the_nether | overworld    | hidden     |

  @shop-map @property @world-filter @multiple
  Scenario Outline: Multiple players filtered correctly
    Given a shop in overworld
    And <overworld_count> players in overworld
    And <nether_count> players in the_nether
    Then <visible_count> player markers should be visible

    Examples: Player counts
      | overworld_count | nether_count | visible_count |
      | 1               | 0            | 1             |
      | 2               | 0            | 2             |
      | 3               | 0            | 3             |
      | 0               | 1            | 0             |
      | 1               | 1            | 1             |
      | 2               | 3            | 2             |
      | 5               | 5            | 5             |

  @shop-map @property @world-filter @nether
  Scenario Outline: Nether shop shows only nether players
    Given a shop in the_nether
    And <overworld_count> players in overworld
    And <nether_count> players in the_nether
    Then <visible_count> player markers should be visible

    Examples: Nether player counts
      | overworld_count | nether_count | visible_count |
      | 0               | 1            | 1             |
      | 0               | 3            | 3             |
      | 3               | 0            | 0             |
      | 2               | 2            | 2             |

  # ===========================================================================
  # Edge Marker Properties
  # ===========================================================================

  @shop-map @property @edge-marker
  Scenario Outline: Off-screen players show edge markers
    Given a shop at (0, 0)
    And the map viewport shows -500 to 500
    And a player at (<player_x>, <player_z>)
    Then the player should have <marker_type>

    Examples: Marker types by position
      | player_x | player_z | marker_type     |
      | 0        | 0        | normal marker   |
      | 200      | 200      | normal marker   |
      | 499      | 0        | normal marker   |
      | 501      | 0        | edge marker     |
      | 1000     | 0        | edge marker     |
      | 0        | 1000     | edge marker     |
      | 5000     | 5000     | edge marker     |

  @shop-map @property @edge-marker @direction
  Scenario Outline: Edge marker points toward player
    Given a shop at (0, 0)
    And a player at (<player_x>, <player_z>)
    Then the edge marker should point <direction>

    Examples: Directional edge markers
      | player_x | player_z | direction  |
      | 1000     | 0        | east       |
      | -1000    | 0        | west       |
      | 0        | 1000     | south      |
      | 0        | -1000    | north      |
      | 1000     | 1000     | southeast  |
      | -1000    | -1000    | northwest  |

  # ===========================================================================
  # Empty State Properties
  # ===========================================================================

  @shop-map @property @edge-marker @label
  Scenario Outline: Edge marker label avoids overflow
    Given a shop at (0, 0)
    And a player at (<player_x>, <player_z>)
    Then the edge marker label should be positioned "<label_position>"

    Examples: Label positions by player direction
      | player_x | player_z | label_position  |
      | 1000     | 0        | left of marker  |
      | -1000    | 0        | right of marker |
      | 0        | -1000    | below marker    |
      | 0        | 1000     | above marker    |

  @shop-map @property @empty
  Scenario Outline: No markers when no players in world
    Given a shop in <world>
    And 0 players in <world>
    Then 0 player markers should be visible

    Examples: Empty worlds
      | world      |
      | overworld  |
      | the_nether |
