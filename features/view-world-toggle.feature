Feature: View World Toggle
  As a player navigating across dimensions
  I want to toggle between overworld and nether map views
  So that I can see shops in their native coordinate system

  Background:
    Given the app is loaded with shops in overworld and nether

  # ============================================================================
  # Toggle Button Display
  # ============================================================================

  @navigation @view-toggle
  Scenario: View toggle controls appear in navigation dialog
    Given player "TestPlayer" is in the overworld at (0, 0)
    When I open the navigation dialog with items from both worlds
    Then I should see the view mode toggle button
    And I should see the world toggle button
    And the view mode should default to "auto"

  @navigation @view-toggle
  Scenario: World toggle is disabled in auto mode
    Given player "TestPlayer" is in the overworld at (0, 0)
    When I open the navigation dialog with items from both worlds
    Then the world toggle button should be disabled
    And the view mode toggle should show "Auto"

  # ============================================================================
  # Manual Mode
  # ============================================================================

  @navigation @view-toggle @manual
  Scenario: Switching to manual mode enables world toggle
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    When I click the view mode toggle button
    Then the view mode should change to "manual"
    And the world toggle button should be enabled

  @navigation @view-toggle @manual
  Scenario: Toggling world view switches to nether tiles
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    And I switch to manual view mode
    When I click the world toggle button
    Then nether tiles should be loaded
    And overworld shops should show at divided coordinates

  @navigation @view-toggle @manual
  Scenario: Cross-world markers have distinct styling
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    And I switch to manual view mode
    When I click the world toggle button to view nether
    Then overworld shop markers should have dashed borders
    And overworld shop markers should be semi-transparent

  # ============================================================================
  # Auto Mode - Portal Crossing
  # ============================================================================

  @navigation @view-toggle @auto @portal @skip
  Scenario: View auto-switches when player crosses to nether
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    And the view mode is "auto"
    When the player crosses a portal to the nether
    Then the view should switch to nether
    And nether tiles should be loaded
    And the world toggle button should show nether active

  @navigation @view-toggle @auto @portal @skip
  Scenario: View auto-switches when player returns to overworld
    Given player "TestPlayer" is in the nether at (100, 50)
    And I open the navigation dialog with items from both worlds
    And the view mode is "auto"
    When the player crosses a portal to the overworld
    Then the view should switch to overworld
    And overworld tiles should be loaded

  @navigation @view-toggle @manual @portal
  Scenario: View does NOT auto-switch in manual mode
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    And I switch to manual view mode
    When the player crosses a portal to the nether
    Then the view should remain on overworld
    And overworld tiles should still be loaded

  # ============================================================================
  # Coordinate Display
  # ============================================================================

  @navigation @view-toggle @coords
  Scenario: Nether view shows native nether coordinates
    Given player "TestPlayer" is in the nether at (100, 50)
    And I open the navigation dialog with a nether shop at (200, 100)
    And I switch to manual view mode
    When I toggle to nether view
    Then the nether shop marker should be at position (200, 100)
    And the player marker should be at position (100, 50)

  @navigation @view-toggle @coords
  Scenario: Overworld in nether view shows divided coordinates
    Given player "TestPlayer" is in the nether at (100, 50)
    And I open the navigation dialog with an overworld shop at (800, 400)
    And I switch to manual view mode
    When I toggle to nether view
    Then the overworld shop marker should be at position (100, 50)
    And the marker should have cross-world styling

  # ============================================================================
  # Persistence
  # ============================================================================

  @navigation @view-toggle @persistence @skip
  Scenario: View mode preference is remembered
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    And I switch to manual view mode
    When I close and reopen the navigation dialog
    Then the view mode should still be "manual"

  @navigation @view-toggle @persistence @skip
  Scenario: View world preference is remembered in manual mode
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    And I switch to manual view mode
    And I toggle to nether view
    When I close and reopen the navigation dialog

  # ============================================================================
  # Follow Mode + World Toggle (Nether Player Bug Scenarios)
  # ============================================================================

  @navigation @view-toggle @follow @nether
  Scenario: Map stays centered on nether player when switching to manual mode
    Given player "TestPlayer" is in the nether at (100, 50)
    And I start navigation with items from both worlds
    And the map is in follow mode and centered on the player
    When I switch to manual view mode
    Then the map should still be centered on the player
    And the player marker should be at overworld-equivalent position (800, 400)

  @navigation @view-toggle @follow @nether
  Scenario: Map recenters correctly when toggling to nether view with nether player
    Given player "TestPlayer" is in the nether at (100, 50)
    And I start navigation with items from both worlds
    And the map is in follow mode and centered on the player
    And I switch to manual view mode
    When I toggle to nether view
    Then the player marker should be at position (100, 50)
    And the map should be centered on the player

  @navigation @view-toggle @follow @nether
  Scenario: Route shows correctly when toggling to nether view with nether player
    Given player "TestPlayer" is in the nether at (100, 50)
    And I start navigation with items from both worlds
    And I switch to manual view mode
    When I toggle to nether view
    Then nether tiles should be loaded
    And the route line should connect the markers correctly
