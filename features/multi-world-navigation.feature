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

  @navigation @world-switch
  Scenario: Map initializes with nether tiles when player is in nether
    Given player "TestPlayer" is in the nether at (0, 0)
    When I open the navigation dialog with items from both worlds
    Then nether tiles should be requested first

  @navigation @world-switch @transition
  Scenario: Map transitions to nether tiles when player enters nether
    Given player "TestPlayer" is in the overworld at (0, 0)
    And I open the navigation dialog with items from both worlds
    When player moves to the nether at (-500, -50)
    Then nether tiles should be requested
