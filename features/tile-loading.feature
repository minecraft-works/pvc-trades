Feature: Tile Loading
  As a user viewing the map
  I want tiles to be loaded straight from the map server
  So that I always see the best available map detail

  Background:
    Given the tile loading test app is configured

  @tiles @loading
  Scenario: Both tile levels are requested for an overworld shop
    When I open the navigation map with an overworld item
    Then detail level tiles should be requested
    And overview level tiles should be requested

  @tiles @loading @nether @unified
  Scenario: Unified view shows overworld tiles even for nether shops
    When I open the navigation map with a nether item
    Then overworld tile requests should be made
    And no nether tile requests should be made

  @tiles @loading @request-counting
  Scenario: Tiles are only requested once per session
    When I open the navigation map with an overworld item
    And I record the tile request count
    And I wait for any pending tile requests
    Then no additional tile requests should be made

  @tiles @loading @far-away
  Scenario: Far-away shops request the tiles at their location
    When I open the navigation map with a far-away shop item
    Then tiles containing the block position (50000, 50000) should be requested at both levels

  @tiles @missing @fallback
  Scenario: Overview stays visible when the server has no detail tiles
    Given the map server has no detail tiles
    When I open the navigation map with an overworld item
    Then detail level tiles should be requested
    And no detail tile should remain on the map
    And overview tiles should be displayed on the map
    And no broken tile image should remain on the map

  @tiles @dynamic @moveend
  Scenario: Tiles load dynamically when map moves to new location
    Given the navigation map is open with an overworld item
    When I pan the map to a new area
    Then the map should display tiles at the player location

  @tiles @dynamic @pan
  Scenario: Panning the map requests additional tiles
    Given the navigation map is open with an overworld item
    Then detail level tiles should be requested
    When I pan the map to a new area
    Then the map should continue displaying tiles

  # ============================================================================
  # Tile Positioning Scenarios - Verify tiles appear in correct locations
  # ============================================================================

  @tiles @positioning @viewport
  Scenario: Tiles are visible within the viewport after loading
    Given the navigation map is open with an overworld item
    Then at least one tile should be visible in the viewport

  # The player position drives the tile area: the detail tile under the player
  # (512 blocks per tile, e.g. (13, -8) for (7000, -4000)) must be requested.
  @tiles @positioning @distant-player
  Scenario: Tiles are positioned correctly when following distant player
    Given the navigation map is open with an overworld item
    And the tile test player is at position (7000, -4000)
    When the map centers on the player position
    Then tiles should be visible within the viewport
    And the visible tiles should correspond to the player area

  @tiles @positioning @bounds
  Scenario: Tile bounds match their world coordinates
    Given the navigation map is open with an overworld item
    Then each loaded tile should have bounds matching its tile coordinates

  @tiles @positioning @pan-visibility
  Scenario: Tiles remain visible after panning far from initial view
    Given the navigation map is open with an overworld item
    When I pan the map significantly to the east
    Then at least one tile should be visible in the viewport
    And the visible tiles should be in the eastern area

  @tiles @positioning @zoom-consistency
  Scenario: Tile positions are consistent across zoom levels
    Given the navigation map is open with an overworld item
    When I zoom out the map
    Then tiles should still be visible in the viewport
    And overview tiles should cover the same area as detail tiles

  @tiles @positioning @nether @unified
  Scenario: Nether shops positioned at overworld-equivalent on unified map
    Given the navigation map is open with a nether item
    Then at least one tile should be visible in the viewport
    And nether shop markers should be visible
    And only overworld tiles should be loaded

  @tiles @positioning @follow-mode
  Scenario: Tiles load correctly when map follows moving player
    Given the navigation map is open with an overworld item
    And the tile test player is at position (100, 200)
    When the tile test player moves to (5000, 5000)
    And the map follows the player
    Then tiles should be visible within the viewport
    And the visible tiles should correspond to the new player area
