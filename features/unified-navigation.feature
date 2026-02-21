Feature: Unified Multi-World Navigation
  As a player shopping across dimensions
  I want to see all shops on a single unified map
  So that I can plan my complete shopping trip at a glance

  Background:
    Given the app is loaded with shops in overworld and nether

  # ============================================================================
  # Unified Map Display
  # ============================================================================

  @navigation @unified-map
  Scenario: Map shows both overworld and nether shops together
    Given player "TestPlayer" is in the overworld at (0, 0)
    When I open the navigation dialog with items from both worlds
    Then the map should show markers for both worlds
    And overworld shop markers should be visible
    And nether shop markers should be visible with nether styling

  @navigation @unified-map @coords
  Scenario: Nether shops display at overworld-equivalent coordinates
    Given player "TestPlayer" is in the overworld at (0, 0)
    When I open the navigation dialog with the nether shop
    Then the nether shop marker should be positioned at 8x nether coordinates

  @navigation @unified-map @tiles
  Scenario: Map always shows overworld tiles as base layer
    Given player "TestPlayer" is in the overworld at (0, 0)
    When I open the navigation dialog with items from both worlds
    Then only overworld tiles should be loaded
    And nether shops should appear on overworld tiles

  @navigation @unified-map @tiles
  Scenario: Nether tiles shown when player is in nether
    Given player "TestPlayer" is in the nether at (100, 50)
    When I open the navigation dialog with items from both worlds
    Then the map should use the nether world
    And the player marker should be at overworld-equivalent position (800, 400)

  # ============================================================================
  # Nether Visual Distinction
  # ============================================================================

  @navigation @nether-style
  Scenario: Nether shops have distinct visual styling
    Given player "TestPlayer" is in the overworld at (0, 0)
    When I open the navigation dialog with items from both worlds
    Then nether shop markers should have a red/nether tint
    And nether shop markers should show a nether icon indicator

  @navigation @nether-style @tooltip
  Scenario: Nether shop tooltip shows both coordinate systems
    Given player "TestPlayer" is in the overworld at (0, 0)
    When I open the navigation dialog with the nether shop
    And I hover over the nether shop marker
    Then the tooltip should show nether coordinates
    And the tooltip should show overworld equivalent coordinates

  # ============================================================================
  # Player Position Across Worlds
  # ============================================================================

  @navigation @player-position
  Scenario: Player in overworld shows at actual position
    Given player "TestPlayer" is in the overworld at (500, 300)
    When I open the navigation dialog with items from both worlds
    Then the player marker should be at position (500, 300)

  @navigation @player-position @nether
  Scenario: Player in nether shows at overworld-equivalent position
    Given player "TestPlayer" is in the nether at (100, 50)
    When I open the navigation dialog with items from both worlds
    Then the player marker should be at overworld-equivalent position (800, 400)
    And the player marker should have nether styling

  @navigation @player-position @transition
  Scenario: Player marker updates position when entering nether
    Given player "TestPlayer" is in the overworld at (800, 400)
    And I open the navigation dialog with items from both worlds
    When player moves to the nether at (100, 50)
    Then the player marker should stay at approximately the same map position
    And the player marker should change to nether styling

  @navigation @player-position @transition  
  Scenario: Player marker updates when leaving nether
    Given player "TestPlayer" is in the nether at (100, 50)
    And I open the navigation dialog with items from both worlds
    When player moves to the overworld at (800, 400)
    Then the player marker should stay at approximately the same map position
    And the player marker should change to overworld styling

  # ============================================================================
  # Route Display
  # ============================================================================

  @navigation @route @unified
  Scenario: Route line connects shops across both worlds
    Given player "TestPlayer" is in the overworld at (0, 0)
    And there is an overworld shop at (400, 400)
    And there is a nether shop at (100, 100)
    When I open the navigation dialog with both shops
    Then the route line should connect all stops
    And the route should go from player to nearest shop

  @navigation @route @distance
  Scenario: Distance calculation uses overworld-equivalent coordinates
    Given player "TestPlayer" is in the overworld at (0, 0)
    When I open the navigation dialog with the nether shop
    Then the distance should be calculated using 8x nether coordinates

  # ============================================================================
  # Timeline Integration
  # ============================================================================

  @navigation @timeline @world-indicator
  Scenario: Route preview shows world indicator for each stop
    Given player "TestPlayer" is in the overworld at (0, 0)
    When I open the cart with items from both worlds
    And I switch to the Route tab
    Then the route preview should show overworld stops without nether styling
    And the route preview should show nether stops with nether styling
