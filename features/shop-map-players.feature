Feature: Shop Map Player Markers
  As a player viewing a shop location
  I want to see other players in the same world on the map
  So that I can coordinate with nearby players

  Background:
    Given the app is loaded with mock shop data
    And there are players in both worlds

  @shop-map @players
  Scenario: Overworld shop shows only overworld players
    Given there is a player "OverworldAlice" in the overworld at (100, 200)
    And there is a player "NetherBob" in the nether at (-50, -50)
    When I click on the distance cell of an overworld shop
    Then the map should show player marker for "OverworldAlice"
    And the map should not show player marker for "NetherBob"

  @shop-map @players
  Scenario: Nether shop shows only nether players
    Given there is a player "OverworldAlice" in the overworld at (100, 200)
    And there is a player "NetherBob" in the nether at (-50, -50)
    When I click on the distance cell of a nether shop
    Then the map should show player marker for "NetherBob"
    And the map should not show player marker for "OverworldAlice"

  @shop-map @players
  Scenario: Shop map shows multiple players in same world
    Given there is a player "Alice" in the overworld at (100, 200)
    And there is a player "Bob" in the overworld at (150, 250)
    And there is a player "Charlie" in the overworld at (50, 100)
    When I click on the distance cell of an overworld shop
    Then the map should show player markers for "Alice", "Bob", and "Charlie"

  @shop-map @players
  Scenario: Empty nether shows no player markers
    Given there is a player "OverworldAlice" in the overworld at (100, 200)
    And there are no players in the nether
    When I click on the distance cell of a nether shop
    Then the map should show no player markers

  @shop-map @players @edge-markers
  Scenario: Off-screen players show edge markers
    Given there is a player "FarAwayPlayer" in the overworld at (5000, 5000)
    When I click on the distance cell of an overworld shop at (100, 200)
    Then there should be an edge marker pointing toward "FarAwayPlayer"
