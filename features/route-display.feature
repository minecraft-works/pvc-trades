Feature: Route Display
  As a player planning a shopping trip
  I want to see my optimized route
  So that I know where to go and what to buy

  Background:
    Given the app is loaded with mock shop data

  # ============================================================================
  # Route Timeline
  # ============================================================================

  @route @timeline
  Scenario: Timeline shows all shops in order
    Given I have 3 items from different shops in my cart
    When I open the navigate tab
    Then I should see 3 stops in the timeline
    And they should be numbered 1, 2, 3

  @route @timeline
  Scenario: Timeline shows item details
    Given I add a trade for "Diamond" quantity 5 to my cart
    When I open the navigate tab
    Then the timeline should show "5× Diamond"

  @route @timeline
  Scenario: Timeline shows both coordinate systems
    Given I add an overworld shop at (800, 400) to my cart
    When I open the navigate tab
    Then I should see overworld coords "800, 400"
    And I should see nether equivalent "100, 50"

  @route @timeline
  Scenario: Nether shop shows nether coords primary
    Given I add a nether shop at (100, 50) to my cart
    When I open the navigate tab
    Then I should see nether coords "100, 50"
    And I should see overworld equivalent "800, 400"

  @route @timeline
  Scenario: Completed stops show checkmark
    Given I have a shop marked as complete
    When I open the navigate tab
    Then the completed stop should show a checkmark
    And it should have completed styling

  # ============================================================================
  # Total Distance
  # ============================================================================

  @route @distance
  Scenario: Shows total route distance
    Given I have items from shops spread across the world
    When I open the navigate tab
    Then I should see the total distance in blocks
    And I should see the nether-equivalent distance

  @route @distance
  Scenario: Distance accounts for nether travel
    Given I have a shop at (0, 0) overworld
    And a shop at (0, 0) nether (equivalent to 0, 0 overworld)
    When I open the navigate tab
    Then the distance should be 0 blocks

  @route @distance
  Scenario: Distance updates when cart changes
    Given I have 2 items showing 500 blocks distance
    When I remove one item from the cart
    Then the distance should update to reflect shorter route

  # ============================================================================
  # Route Updates
  # ============================================================================

  @route @update
  Scenario: Route recalculates when item added
    Given I have 2 items in my cart with optimized route
    When I add a 3rd item closer to the start
    Then the route order may change
    And the distance should update

  @route @update
  Scenario: Route recalculates when item removed
    Given I have 3 items in my cart
    When I remove the middle item
    Then the route should have 2 items
    And the timeline should update

  @route @update
  Scenario: Route recalculates when quantity changes to zero
    Given I have 2 items in my cart
    When I decrease one item's quantity to zero
    And I close and reopen the cart
    Then the route should have 1 item

  # ============================================================================
  # Click Navigation
  # ============================================================================

  @route @click
  Scenario: Click timeline stop opens map (when not navigating)
    Given I am viewing the navigate tab
    And navigation is not active
    When I click on a shop stop
    Then the map dialog should open
    And it should be centered on that shop

  @route @click
  Scenario: Click timeline stop toggles completion (when navigating)
    Given I am actively navigating
    When I click on a shop stop
    Then the stop should toggle completion
    And the map should stay open
