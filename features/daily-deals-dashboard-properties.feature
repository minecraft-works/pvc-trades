@dashboard @property
Feature: Daily Deals Dashboard Properties
  Property-based tests for dashboard edge cases and data integrity

  Background:
    Given the app is loaded with dashboard test data

  # ============================================================================
  # Snapshot Data Integrity
  # ============================================================================

  @dashboard @property @snapshot
  Scenario: Snapshot contains all current trades
    Then a trade snapshot should be saved in localStorage
    And the snapshot timestamp should be recent
    And every visible trade should have a snapshot entry

  @dashboard @property @snapshot
  Scenario: Snapshot survives page reload
    When I reload the app
    Then a trade snapshot should be saved in localStorage

  # ============================================================================
  # Dashboard Content Accuracy
  # ============================================================================

  @dashboard @property @accuracy
  Scenario: Price drops only shown when deviation improved significantly
    Given I have a previous snapshot with slightly better deviations
    When I reload the app
    Then the deals dashboard should not be visible

  @dashboard @property @accuracy
  Scenario: Empty watchlist produces no watchlist section
    Given I have a previous snapshot with different prices
    And I have no favorites
    When I reload the app
    Then the dashboard should not show a watchlist section

  # ============================================================================
  # localStorage Edge Cases
  # ============================================================================

  @dashboard @property @storage
  Scenario: Corrupted snapshot is safely ignored
    Given localStorage contains corrupted snapshot data
    When I reload the app
    Then the deals dashboard should not be visible
    And no error should appear in the console

  @dashboard @property @storage
  Scenario: Empty snapshot is safely ignored
    Given localStorage contains an empty snapshot
    When I reload the app
    Then the deals dashboard should not be visible
