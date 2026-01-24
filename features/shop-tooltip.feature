Feature: Shop Tooltip
  As a player arriving at a shop
  I want to see what I need to buy there
  So that I don't forget any items

  Background:
    Given the app is loaded with shops in the overworld
    And I have multiple items from the same shop in my cart

  @tooltip @arrival
  Scenario: Tooltip appears when entering shop area
    Given I am navigating as "TestPlayer"
    And the shop at (100, 100) has 2 items to buy
    When player enters within 100 blocks of (100, 100)
    Then a shopping list tooltip should appear
    And it should list both items with quantities

  @tooltip @arrival
  Scenario: Tooltip shows only uncompleted items
    Given I am navigating as "TestPlayer"
    And the shop at (100, 100) has 3 items
    And 1 item is already marked complete
    When player enters the shop area
    Then the tooltip should show only 2 items

  @tooltip @auto-hide
  Scenario: Tooltip auto-hides after 4 seconds
    Given the shop tooltip is visible
    When 4 seconds pass
    Then the tooltip should hide automatically

  @tooltip @area
  Scenario: Tooltip only shows once per shop entry
    Given player has entered the shop area
    And the tooltip appeared and hid
    When player moves within the shop area
    Then the tooltip should not reappear

  @tooltip @leaving
  Scenario: Re-entering shop shows tooltip again
    Given player entered and left the shop area
    When player enters the shop area again
    Then the tooltip should appear again

  @tooltip @priority
  Scenario: Shows nearest shop when multiple in range
    Given there are 2 shops within 100 blocks
    When player is closest to shop A
    Then the tooltip should show shop A's items
