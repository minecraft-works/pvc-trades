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
