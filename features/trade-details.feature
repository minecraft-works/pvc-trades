Feature: Trade Details Popover
  As a user viewing trades
  I want to see complete item details including lore and enchantments
  So that I can make informed trading decisions

  Background:
    Given the app is loaded with mock shop data

  @trade-details @click
  Scenario: Click on result name opens item details
    When I click on the result name of a trade
    Then the trade details dialog should be visible
    And the dialog title should be "Item Details"
    And I should see the result item name

  @trade-details @click
  Scenario: Click on cost name opens item details
    When I click on the cost name of a trade
    Then the trade details dialog should be visible
    And the dialog title should be "Item Details"
    And I should see the cost item name

  @trade-details @item2 @skip
  Scenario: Cost details shows both items when item2 exists
    Given there is a trade with two cost items
    When I click on the cost name of that trade
    Then the trade details dialog should be visible
    And I should see both cost item names

  @trade-details @lore @skip
  Scenario: Trade details shows lore when present
    Given there is a trade with lore on the result item
    When I click on the result name of that trade
    Then the trade details dialog should be visible
    And I should see the lore text

  @trade-details @enchant @skip
  Scenario: Trade details shows enchantments when present
    Given there is a trade with enchanted items
    When I click on the result name of that trade
    Then the trade details dialog should be visible
    And I should see enchantment details

  @trade-details @close
  Scenario: Close button closes the trade details dialog
    When I click on the result name of a trade
    And I click the close button on trade details
    Then the trade details dialog should be hidden

  @trade-details @close
  Scenario: Clicking outside closes the trade details dialog
    When I click on the result name of a trade
    And I click outside the trade details dialog
    Then the trade details dialog should be hidden

  @trade-details @map
  Scenario: Click on distance cell opens map instead of details
    When I click on the distance cell of an overworld shop
    Then the map dialog should be visible
    And the trade details dialog should be hidden
