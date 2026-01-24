Feature: Tile Loading
  As a user viewing the map
  I want tiles to load correctly based on availability
  So that I always see the best available map detail

  Background:
    Given the tile loading test app is configured

  @tiles @loading
  Scenario: Both zoom levels are requested when available in manifest
    When I open the navigation map with an overworld item
    Then zoom 8 tiles should be requested
    And zoom 4 tiles should be requested

  @tiles @loading @nether
  Scenario: Nether tiles load from correct path when viewing nether shop
    When I open the navigation map with a nether item
    Then nether tile requests should include "/the_nether/" in path

  @tiles @loading @request-counting
  Scenario: Tiles are only requested once per session
    When I open the navigation map with an overworld item
    And I record the tile request count
    And I wait for any pending tile requests
    Then no additional tile requests should be made

  @tiles @caching
  Scenario: Tiles are cached across map sessions
    When I open the navigation map with an overworld item
    And I record the tile request count
    And I close and reopen the navigation map
    Then no additional tile requests should be made

  @tiles @manifest
  Scenario: No requests made for tiles not in manifest
    Given the manifest only includes tiles near origin
    When I open the navigation map with a far-away shop item
    Then only tiles near origin should be requested
