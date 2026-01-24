Feature: Zoom Behavior
  As a player navigating to shops
  I want the map to zoom automatically
  So that I see appropriate detail based on my distance

  Background:
    Given the app is loaded with shops in the overworld
    And I have items in my cart
    And I start navigation as "TestPlayer"

  # ============================================================================
  # Distance-Based Zoom
  # Note: Mock shop is at (100, 200) in the overworld
  # These tests require complex state setup - marked @wip
  # ============================================================================

  @zoom @distance @wip
  Scenario: Zoom in when close to shop (just outside arrival radius)
    Given the next shop is at (100, 200)
    # Note: Arrival radius is 50 blocks, arrival triggers auto-completion
    # Closest we can test without triggering arrival is 50 blocks (zoom 0 range: 50-150)
    When player is at (100, 150)
    Then the map should be at zoom level 0

  @zoom @distance @wip
  Scenario: Medium zoom when close (50-150 blocks)
    Given the next shop is at (100, 200)
    When player is at (100, 100)
    Then the map should be at zoom level 0

  @zoom @distance @wip
  Scenario: Zoom out when moderately far (150-400 blocks)
    Given the next shop is at (100, 200)
    When player is at (100, -100)
    Then the map should be at zoom level -1

  @zoom @distance @wip
  Scenario: Further zoom out (400-800 blocks)
    Given the next shop is at (100, 200)
    When player is at (100, -400)
    Then the map should be at zoom level -2

  @zoom @distance @wip
  Scenario: Maximum zoom out when far (> 800 blocks)
    Given the next shop is at (100, 200)
    When player is at (100, -700)
    Then the map should be at zoom level -3

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
    # Note: "close" means just outside arrival radius (50 blocks) to avoid auto-complete
    # 52 blocks away puts us in the 50-150 range (zoom 0)
    When player moves close to a shop
    Then the map should animate to zoom 0

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
