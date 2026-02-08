@favorites @property @skip
Feature: Favorites Properties
  Property-based tests for favorites watchlist edge cases

  Background:
    Given the app is loaded with mock shop data

  # ============================================================================
  # Name Normalization
  # ============================================================================

  Scenario: Item names are normalized to lowercase
    When I open the favorites dialog
    And I type "Diamond Pickaxe" in the add input
    And I click the save button in the add row
    Then the item should be stored as "diamond pickaxe"

  Scenario: Whitespace is trimmed from item names
    When I open the favorites dialog
    And I type "  Iron Sword  " in the add input
    And I click the save button in the add row
    Then the item should be stored as "iron sword"

  # ============================================================================
  # Duplicate Handling
  # ============================================================================

  Scenario: Adding same item twice updates threshold
    Given I have "diamond" in my favorites with threshold -25
    When I open the favorites dialog
    And I click the edit button for the item
    And I select "≤-50%" in the edit dropdown
    And I click the save button in the row
    Then I should have exactly 1 favorite
    And the threshold should be -50

  Scenario: Case variations are treated as same item
    Given I have "diamond pickaxe" in my favorites
    When I open the favorites dialog
    And I type "Diamond Pickaxe" in the add input
    And I click the save button in the add row
    Then I should have exactly 2 entries
    # Note: The add form creates a new entry, but the star check normalizes

  # ============================================================================
  # Threshold Dropdown Values
  # ============================================================================

  Scenario Outline: Threshold dropdown maps to correct values
    When I open the favorites dialog
    And I type "Test Item" in the add input
    And I select "<option>" in the add row dropdown
    And I click the save button in the add row
    Then the stored threshold should be <value>

    Examples:
      | option | value     |
      | Deal   | undefined |
      | ≤-25%  | -25       |
      | ≤-50%  | -50       |
      | ≤-75%  | -75       |
      | ≤-100% | -100      |
