Feature: Multi-World Navigation
  As a player shopping across dimensions
  I want the map to show tiles for my current world
  So that I can see relevant navigation information

  Background:
    Given the app is loaded with shops in overworld and nether

  @navigation @world-switch
  Scenario: Map initializes with overworld tiles when player is in overworld
    Given player "TestPlayer" is in the overworld at (0, 0)
    When I open the navigation dialog with items from both worlds
    Then overworld tiles should be requested first
    And the map should be showing "overworld" world
    And no nether tiles should be loaded on the map

  @navigation @world-switch
  Scenario: Map initializes with nether tiles when player is in nether
    Given player "TestPlayer" is in the nether at (0, 0)
    When I open the navigation dialog with items from both worlds
    Then nether tiles should be requested first
    And the map should be showing "nether" world
    And no overworld tiles should be loaded on the map

  @navigation @world-switch @transition
  Scenario: Map transitions to nether tiles when player enters nether
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    And the map should be showing "overworld" world
    When player moves to the nether at (-500, -50)
    Then the map should switch to "nether" world
    And nether tiles should be requested
    And the route should show nether shop markers
    And the map should be centered on the player

  @navigation @world-switch @transition
  Scenario: Map transitions to overworld tiles when player returns from nether
    Given player "TestPlayer" is in the nether at (-500, -50)
    And I open the navigation dialog with items from both worlds
    And the map should be showing "nether" world
    When player moves to the overworld at (100, 200)
    Then the map should switch to "overworld" world
    And overworld tiles should be requested
    And the route should show overworld shop markers
    And the map should be centered on the player

  @navigation @world-switch @no-shops
  Scenario: Map stays on current world when entering world without shops
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I add only nether items to cart
    And I start navigation as "TestPlayer"
    And the map should be showing "nether" world
    And nether tiles should have been loaded
    When player moves to the overworld at (100, 200)
    Then the map should stay on "nether" world
    And no new overworld tiles should be loaded

  @navigation @world-switch @polling
  Scenario: World switch detection survives multiple polling cycles
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    And the map should be showing "overworld" world
    And I wait for at least 2 polling cycles
    When player moves to the nether at (-500, -50)
    And I wait for at least 2 polling cycles
    Then the map should switch to "nether" world
    And the player position world should be "the_nether"
    And the previous position should have been "overworld"

  @navigation @world-switch @rapid
  Scenario: Rapid world transitions are handled correctly
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    And the map should be showing "overworld" world
    When player moves to the nether at (-500, -50)
    And I wait for map to switch to "nether"
    And player moves to the overworld at (100, 200)
    And I wait for map to switch to "overworld"
    Then the map should be showing "overworld" world
    And the route should show overworld shop markers

  @navigation @world-switch @completed
  Scenario: World switch works when some shops in new world are completed
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    And the map should be showing "overworld" world
    And I mark the overworld shop as completed
    When player moves to the nether at (-500, -50)
    Then the map should switch to "nether" world
    And nether tiles should be requested

  @navigation @world-switch @allcompleted  
  Scenario: World does not switch when all shops in new world are completed
    Given player "TestPlayer" is in the nether at (-100, -12)
    And I open the navigation dialog with items from both worlds
    And the map should be showing "nether" world
    And I mark the nether shop as completed
    When player moves to the overworld at (100, 200)
    Then the map should switch to "overworld" world
    And overworld tiles should be requested
