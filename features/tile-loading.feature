Feature: Tile Loading
  As a user viewing the map
  I want tiles to load correctly based on availability
  So that I always see the best available map detail

  Background:
    Given the tile loading test app is configured

  @tiles @loading
  Scenario: Both zoom levels are requested when available in manifest
    When I open the navigation map with an overworld item
    Then zoom 8 tiles should be requested
    And zoom 4 tiles should be requested

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

  @tiles @caching @skip
  Scenario: Tiles are cached across map sessions
    When I open the navigation map with an overworld item
    And I record the tile request count
    And I close and reopen the navigation map
    Then no additional tile requests should be made

  @tiles @manifest
  Scenario: No requests made for tiles not in manifest
    Given the manifest only includes tiles near origin
    When I open the navigation map with a far-away shop item
    Then only tiles near origin should be requested

  @tiles @dynamic @moveend
  Scenario: Tiles load dynamically when map moves to new location
    Given the navigation map is open with an overworld item
    When I pan the map to a new area
    Then the map should display tiles at the player location

  @tiles @dynamic @pan
  Scenario: Panning the map requests additional tiles
    Given the navigation map is open with an overworld item
    Then zoom 8 tiles should be requested
    When I pan the map to a new area
    Then the map should continue displaying tiles

  # ============================================================================
  # Tile Positioning Scenarios - Verify tiles appear in correct locations
  # ============================================================================

  @tiles @positioning @viewport
  Scenario: Tiles are visible within the viewport after loading
    Given the navigation map is open with an overworld item
    Then at least one tile should be visible in the viewport

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
    And zoom 4 tiles should cover the same area as zoom 8 tiles

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
