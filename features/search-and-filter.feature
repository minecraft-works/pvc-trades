Feature: Search and Filter
  As a player looking for trades
  I want to search by item name
  So that I can quickly find the trades I need

  Background:
    Given the app is loaded with mock shop data

  @search @ui
  Scenario: Filter results by "want" item
    When I search for "emerald" in the want field
    Then only trades offering emerald should be displayed
    And the result count should decrease

  @search @ui
  Scenario: Filter results by "give" item
    When I search for "diamond" in the give field
    Then only trades accepting diamond should be displayed

  @search @ui
  Scenario: Combined filter with both fields
    Given I search for "emerald" in the want field
    When I search for "diamond" in the give field
    Then only trades offering emerald for diamond should be displayed

  @search @ui
  Scenario: No results shows message
    When I search for "nonexistent_item_xyz" in the want field
    Then I should see "No trades found" message

  @search @highlight
  Scenario: Search terms are highlighted in results
    When I search for "emerald" in the want field
    Then "emerald" should be highlighted in the result rows

  @search @sort
  Scenario: Click column header to sort
    When I click the "result-amt" column header
    Then results should be sorted by result amount descending
    When I click the "result-amt" column header again
    Then results should be sorted by result amount ascending

  @search @ui
  Scenario: Swap search terms
    Given I search for "emerald" in the want field
    And I search for "diamond" in the give field
    When I click the swap search button
    Then the want field should contain "diamond"
    And the give field should contain "emerald"

  # ============================================================================
  # Clear Search Buttons
  # ============================================================================

  @search @clear-button
  Scenario: Clear button is hidden when want field is empty
    Then the want field clear button should not be visible

  @search @clear-button
  Scenario: Clear button appears when typing in want field
    When I search for "emerald" in the want field
    Then the want field clear button should be visible

  @search @clear-button
  Scenario: Clear button appears when typing in give field
    When I search for "diamond" in the give field
    Then the give field clear button should be visible

  @search @clear-button
  Scenario: Clicking clear button on want field clears text and re-searches
    Given I search for "emerald" in the want field
    When I click the want field clear button
    Then the want field should contain ""
    And the want field clear button should not be visible

  @search @clear-button
  Scenario: Clicking clear button on give field clears text and re-searches
    Given I search for "diamond" in the give field
    When I click the give field clear button
    Then the give field should contain ""
    And the give field clear button should not be visible

  @search @clear-button
  Scenario: Swap updates clear button visibility
    Given I search for "emerald" in the want field
    When I click the swap search button
    Then the want field clear button should not be visible
    And the give field clear button should be visible
