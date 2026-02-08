@favorites @property @skip
Feature: Favorites Properties
  Property-based tests for favorites watchlist edge cases

  Background:
    Given the app is loaded with mock shop data

  # ============================================================================
  # Threshold Bounds
  # ============================================================================

  Scenario Outline: Threshold values are clamped to valid range
    When I add an item to favorites with threshold <input>
    Then the stored threshold should be <expected>

    Examples:
      | input | expected |
      | -99   | -99      |
      | -100  | -99      |
      | -150  | -99      |
      | 0     | 0        |
      | 500   | 500      |
      | 999   | 999      |
      | 1000  | 999      |
      | 1500  | 999      |

  # ============================================================================
  # Name Normalization
  # ============================================================================

  Scenario Outline: Item names are normalized to lowercase
    Given there is a trade for "<raw_name>"
    When I add it to favorites from the trade row
    Then it should be stored as "<normalized>"

    Examples:
      | raw_name        | normalized      |
      | Diamond Pickaxe | diamond pickaxe |
      | IRON SWORD      | iron sword      |
      | Golden Apple    | golden apple    |
      | netherite ingot | netherite ingot |

  # ============================================================================
  # Duplicate Handling
  # ============================================================================

  Scenario: Adding same item twice updates threshold
    Given I have "Diamond Pickaxe" in my favorites with threshold -10
    When I add "Diamond Pickaxe" to favorites with threshold -30
    Then I should have exactly 1 favorite for "Diamond Pickaxe"
    And the threshold should be -30

  Scenario: Case variations are treated as same item
    Given I have "diamond pickaxe" in my favorites
    When I try to add "Diamond Pickaxe" to favorites
    Then I should have exactly 1 favorite entry
