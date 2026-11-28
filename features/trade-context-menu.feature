Feature: Trade row context menu
  As a player
  I want to copy a shop's location or a sentence about its trade
  So that I can share it in chat

  Background:
    Given the app is loaded with mock shop data

  @context-menu
  Scenario: Copy the coordinates of a trade
    When I right-click the first trade
    And I choose "Copy coordinates" from the context menu
    Then the clipboard should hold the coordinates of the first trade
    And the context menu should be closed

  @context-menu
  Scenario: Copy a chat message about a trade
    When I right-click the first trade
    And I choose "Copy chat message" from the context menu
    Then the clipboard should hold a sentence with the item, the cost and the coordinates of the first trade

  @context-menu
  Scenario: A long press on a trade opens the context menu instead of the map
    When I long-press the first trade
    Then the context menu should be visible
    And the map dialog should be closed

  @context-menu
  Scenario: Escape closes the context menu without copying
    When I right-click the first trade
    And I press "Escape"
    Then the context menu should be closed
