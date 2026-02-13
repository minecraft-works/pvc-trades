Feature: Zoom Behavior
  As a player navigating to shops
  I want the map to zoom automatically based on my altitude
  So that I see appropriate detail when on the ground and overview when high up

  Background:
    Given the app is loaded with shops in the overworld
    And I have items in my cart
    And I start navigation as "TestPlayer"

  # ============================================================================
  # Height-Based Zoom (Y coordinate)
  # Thresholds:
  #   - Y ≤ 80:  zoom 2 (ground level — maximum detail)
  #   - Y ≤ 120: zoom 1 (rooftops / low hills)
  #   - Y ≤ 160: zoom 0 (medium altitude)
  #   - Y ≤ 200: zoom -1 (high altitude)
  #   - Y ≤ 256: zoom -2 (very high)
  #   - Y > 256: zoom -3 (maximum out — elytra / extreme height)
  # ============================================================================

  @zoom @height @wip
  Scenario: Maximum zoom at ground level (Y ≤ 80)
    When player is at position (100, 64, 200)
    Then the map should be at zoom level 2 (maximum)

  @zoom @height @wip
  Scenario: Zoom out slightly at rooftop height (Y 80-120)
    When player is at position (100, 100, 200)
    Then the map should be at zoom level 1

  @zoom @height @wip
  Scenario: Medium zoom at moderate altitude (Y 120-160)
    When player is at position (100, 140, 200)
    Then the map should be at zoom level 0

  @zoom @height @wip
  Scenario: Zoom out at high altitude (Y 160-200)
    When player is at position (100, 180, 200)
    Then the map should be at zoom level -1

  @zoom @height @wip
  Scenario: Further zoom out at very high altitude (Y 200-256)
    When player is at position (100, 230, 200)
    Then the map should be at zoom level -2

  @zoom @height @wip
  Scenario: Maximum zoom out at extreme height (Y > 256)
    When player is at position (100, 300, 200)
    Then the map should be at zoom level -3

  # ============================================================================
  # Height-Based Zoom in Nether
  # Same thresholds apply — Y coordinate works identically in both dimensions
  # ============================================================================

  @zoom @nether @wip @skip
  Scenario: Ground level zoom in nether
    Given the app is loaded with shops in the nether
    And I have nether items in my cart
    And I start navigation as "TestPlayer" in the nether
    When player is at nether position (100, 64, 50)
    Then the map should be at zoom level 2

  @zoom @nether @wip @skip
  Scenario: High altitude zoom in nether (above nether ceiling)
    Given the app is loaded with shops in the nether
    And I have nether items in my cart
    And I start navigation as "TestPlayer" in the nether
    When player is at nether position (100, 200, 50)
    Then the map should be at zoom level -1

  # ============================================================================
  # Follow Mode  
  # These tests require complex state setup - marked @wip
  # ============================================================================

  @zoom @follow @wip
  Scenario: Follow mode centers on player
    Given I am in follow mode
    When player moves to (200, 300)
    Then the map should center on (200, 300)

  @zoom @follow @wip
  Scenario: Zoom adjusts smoothly with flyTo animation
    Given I am in follow mode at zoom -2
    # Moving close to shop (within 60 blocks) should zoom to maximum
    When player moves close to a shop
    Then the map should animate to zoom 2

  @zoom @follow @wip
  Scenario: Maximum zoom when arriving at shop
    Given I am in follow mode
    And the next shop is at (100, 200)
    # Within 60 blocks but outside 50 block auto-advance triggers maximum zoom
    When player is at (100, 145)
    Then the map should be at zoom level 2 (maximum)

  # ============================================================================
  # Manual Mode
  # Note: Re-center button not implemented yet - tests marked @skip
  # ============================================================================

  @zoom @manual @wip @skip
  Scenario: Dragging map switches to manual mode
    Given I am in follow mode
    When I drag the map
    Then I should switch to manual mode
    And the re-center button should appear

  @zoom @manual @wip @skip
  Scenario: Re-center button returns to follow mode
    Given I am in manual mode
    When I click the re-center button
    Then I should switch to follow mode
    And the map should center on player
    And the re-center button should hide

  @zoom @manual @wip
  Scenario: Manual mode preserves user zoom
    Given I am in manual mode
    And I manually zoom to level -1
    When player position updates
    Then the map should stay at zoom -1
    And the map should not re-center
