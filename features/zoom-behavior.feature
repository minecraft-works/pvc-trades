Feature: Zoom Behavior
  As a player navigating to shops
  I want the map to zoom automatically
  So that I see appropriate detail based on my distance

  Background:
    Given the app is loaded with shops in the overworld
    And I have items in my cart
    And I start navigation as "TestPlayer"

  # ============================================================================
  # Distance-Based Zoom (Overworld)
  # Note: Mock shop is at (100, 200) in the overworld
  # Distance thresholds in overworld blocks:
  #   - < 60 blocks: zoom 2 (maximum - arriving at shop)
  #   - 60-100 blocks: zoom 1 (close)
  #   - 100-300 blocks: zoom 0 (medium)
  #   - 300-600 blocks: zoom -1 (far)
  #   - 600-1200 blocks: zoom -2 (very far)
  #   - > 1200 blocks: zoom -3 (maximum out)
  # Note: Auto-advance triggers at 50 blocks, so testing max zoom requires
  #       positioning near a shop that's NOT the current target, or testing
  #       after the first shop auto-completes when close to the next shop.
  # ============================================================================

  @zoom @distance @wip
  Scenario: Maximum zoom when very close to shop (near arrival)
    # With two shops in cart: (100, 200) and (800, 400)
    # Position player 55 blocks from first shop to trigger zoom 2 
    # (within 60 block threshold but outside 50 block auto-advance)
    Given the next shop is at (100, 200)
    When player is at (100, 145)
    Then the map should be at zoom level 2 (maximum)

  @zoom @distance @wip
  Scenario: Zoom in when close to shop (60-100 blocks)
    Given the next shop is at (100, 200)
    # 80 blocks away - in the close range
    When player is at (100, 120)
    Then the map should be at zoom level 1

  @zoom @distance @wip
  Scenario: Medium zoom when close (100-300 blocks)
    Given the next shop is at (100, 200)
    # 100 blocks away
    When player is at (100, 100)
    Then the map should be at zoom level 0

  @zoom @distance @wip
  Scenario: Zoom out when moderately far (300-600 blocks)
    Given the next shop is at (100, 200)
    # 300 blocks away
    When player is at (100, -100)
    Then the map should be at zoom level -1

  @zoom @distance @wip
  Scenario: Further zoom out (600-1200 blocks)
    Given the next shop is at (100, 200)
    # 600 blocks away
    When player is at (100, -400)
    Then the map should be at zoom level -2

  @zoom @distance @wip
  Scenario: Maximum zoom out when far (> 1200 blocks)
    Given the next shop is at (100, 200)
    # 900 blocks away
    When player is at (100, -700)
    Then the map should be at zoom level -3

  # ============================================================================
  # Nether Zoom - accounts for 8x multiplier
  # When in nether, distances are multiplied by 8 for zoom calculation
  # So 100 nether blocks = 800 overworld-equivalent blocks
  # Note: These tests need a separate feature file without the overworld Background
  # ============================================================================

  @zoom @nether @wip @skip
  Scenario: Nether zoom accounts for 8x multiplier - close
    Given the app is loaded with shops in the nether
    And I have nether items in my cart
    And I start navigation as "TestPlayer" in the nether
    And the next nether shop is at (100, 50)
    # 10 nether blocks = 80 OW-equivalent (close range)
    When player is at (100, 40) in the nether
    Then the map should be at zoom level 1

  @zoom @nether @wip @skip
  Scenario: Nether zoom accounts for 8x multiplier - far
    Given the app is loaded with shops in the nether
    And I have nether items in my cart
    And I start navigation as "TestPlayer" in the nether
    And the next nether shop is at (100, 50)
    # 100 nether blocks = 800 OW-equivalent (far range)
    When player is at (100, -50) in the nether
    Then the map should be at zoom level -2

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
