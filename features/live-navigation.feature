Feature: Live Navigation
  As a player navigating between shops
  I want live tracking of my position
  So that I can follow the optimal route hands-free

  Background:
    Given the app is loaded with shops in overworld and nether
    And I have items from multiple shops in my cart

  # ============================================================================
  # Player Position Tracking
  # ============================================================================

  @navigation @player-tracking
  Scenario: Player marker appears on map
    Given player "TestPlayer" is in the overworld at (100, 200)
    When I start navigation
    Then a player marker should appear on the map at (100, 200)

  @navigation @player-tracking
  Scenario: Player marker updates when position changes
    Given I am navigating as "TestPlayer" at (100, 200)
    When the player API returns position (150, 250)
    Then the player marker should move to (150, 250)

  @navigation @player-tracking
  Scenario: Player marker shows heading direction
    Given I am navigating as "TestPlayer" with yaw 90
    When the player marker renders
    Then it should show an arrow pointing west

  @navigation @player-tracking
  Scenario: Player not found shows error message
    Given I am navigating as "NonExistentPlayer"
    When the player API is polled
    Then I should see "not found" in the distance display

  # ============================================================================
  # Live Distance Display
  # ============================================================================

  @navigation @distance
  Scenario: Live distance updates as player moves
    Given I am navigating as "TestPlayer" at (0, 0)
    And the next shop is at (100, 200)
    Then the distance display should show "224 blocks"
    When the player moves to (50, 100)
    Then the distance display should show "112 blocks"

  @navigation @distance
  Scenario: Shows travel instruction when in different world
    Given I am navigating as "TestPlayer" in the overworld
    And the next shop is in the nether
    Then the distance display should show "Travel to the Nether"

  # ============================================================================
  # Auto-Advance
  # ============================================================================

  @navigation @auto-advance
  Scenario: Auto-completes shop when player arrives
    Given I am navigating as "TestPlayer" at (0, 0)
    And the next shop is at (100, 200)
    When player moves to (100, 180)
    Then the first shop should be marked as completed
    And the next shop should become the current target

  @navigation @auto-advance
  Scenario: Route recalculates after auto-complete
    Given I am navigating with 3 shops in my route
    When I auto-complete the first shop
    Then the route should have 2 remaining shops
    And the route polyline should update

  @navigation @auto-advance
  Scenario: Shows completion message when all shops done
    Given I am navigating with 1 shop remaining
    When I auto-complete the last shop
    Then I should see "Route complete! 🎉"

  # ============================================================================
  # Manual Completion
  # ============================================================================

  @navigation @manual-complete
  Scenario: Click timeline dot to mark shop complete
    Given I am navigating with shops in my route
    When I click the dot for the first shop
    Then the shop should be marked as completed
    And the dot should show a checkmark

  @navigation @manual-complete
  Scenario: Click completed dot to unmark
    Given a shop is marked as completed
    When I click the dot for that shop
    Then the shop should be unmarked
    And the dot should be empty

  @navigation @manual-complete
  Scenario: Manual completion syncs across dialogs
    Given I am navigating and have the cart dialog visible
    When I mark a shop as complete in the navigation dialog
    Then the cart dialog should also show it as complete

  # ============================================================================
  # Route Recalculation
  # ============================================================================

  @navigation @recalculate
  Scenario: Route recalculates when player moves significantly
    Given I am navigating as "TestPlayer" at (0, 0)
    And the route is optimized from (0, 0)
    When player moves more than 10 blocks to (100, 100)
    Then the route should be recalculated from (100, 100)

  @navigation @recalculate
  Scenario: Dotted line updates from player to next stop
    Given I am navigating as "TestPlayer" at (0, 0)
    And the next shop is at (100, 200)
    Then a dotted green line should connect player to shop
    When player moves to (50, 100)
    Then the dotted line should update to new positions

  # ============================================================================
  # Navigation Progress Persistence
  # ============================================================================

  @navigation @persistence
  Scenario: Completed shops persist after page reload
    Given I mark shop 1 as complete
    When I reload the page
    And I start navigation again
    Then shop 1 should still be marked as complete

  @navigation @persistence
  Scenario: Progress syncs with cart changes
    Given I have completed some shops
    When I remove a completed item from the cart
    Then that completion status should be removed
