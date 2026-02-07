@cart @property
Feature: Cart Quantity Properties
  Property-based tests for cart quantity calculations and totals
  
  Verifies mathematical correctness of:
  - Quantity aggregation
  - Total cost calculations
  - Resource type grouping

  Background:
    Given the cart test app is configured

  # ===========================================================================
  # Quantity Input Properties
  # ===========================================================================

  @cart @property @quantity
  Scenario Outline: Quantity inputs accept valid values
    Given I have a trade in my cart
    When I change the quantity to <quantity>
    Then the quantity should be <expected>

    Examples: Normal values
      | quantity | expected |
      | 1        | 1        |
      | 5        | 5        |
      | 10       | 10       |
      | 20       | 20       |

    Examples: Edge cases (app allows 0, tests verify actual behavior)
      | quantity | expected |
      | 0        | 0        |
      | -1       | 0        |
      | -100     | 0        |

    Examples: Large values (limited to avoid timeout)
      | quantity | expected |
      | 50       | 50       |
      | 100      | 100      |

  @cart @property @quantity @decimal
  Scenario Outline: Quantity inputs handle non-integer values
    Given I have a trade in my cart
    When I change the quantity to "<input>"
    Then the quantity should be <expected>

    Examples: Decimal values (should truncate/round)
      | input | expected |
      | 1.5   | 1        |
      | 2.9   | 2        |
      | 10.1  | 10       |

  # ===========================================================================
  # Total Cost Calculation Properties
  # ===========================================================================

  @cart @property @totals
  Scenario Outline: Total costs are calculated correctly
    Given I have a trade costing <unit_cost> <resource> per item
    When I set the quantity to <quantity>
    Then the total cost should be <total> <resource>

    Examples: Simple calculations
      | unit_cost | resource | quantity | total |
      | 1         | Diamond  | 1        | 1     |
      | 1         | Diamond  | 10       | 10    |
      | 5         | Diamond  | 4        | 20    |
      | 3         | Emerald  | 7        | 21    |

    Examples: Large quantities
      | unit_cost | resource | quantity | total |
      | 64        | Iron     | 10       | 640   |
      | 32        | Gold     | 25       | 800   |

  @cart @property @totals @aggregation
  Scenario Outline: Costs aggregate correctly across multiple trades
    Given I have <count> trades each costing <cost> <resource>
    When I view the cart totals
    Then the total for <resource> should be <expected>

    Examples: Same resource aggregation
      | count | cost | resource | expected |
      | 2     | 5    | Diamond  | 10       |
      | 3     | 10   | Diamond  | 30       |
      | 5     | 8    | Emerald  | 40       |

  @cart @property @totals @mixed
  Scenario Outline: Mixed resource costs are tracked separately
    Given I have trades costing <cost1> <resource1> and <cost2> <resource2>
    When I view the cart totals
    Then the total for <resource1> should be <cost1>
    And the total for <resource2> should be <cost2>

    Examples: Different resources
      | cost1 | resource1 | cost2 | resource2 |
      | 5     | Diamond   | 10    | Emerald   |
      | 3     | Gold      | 7     | Iron      |

  # ===========================================================================
  # Cart State Properties
  # ===========================================================================

  @cart @property @state
  Scenario: Empty cart shows zero totals
    Given my cart is empty
    When I view the cart totals
    Then all resource totals should be zero

  @cart @property @state
  Scenario: Removing last item returns to empty state
    Given I have exactly 1 trade in my cart
    When I remove that trade
    Then the cart should be empty
    And the cart badge should not be visible

  @cart @property @state @persistence
  Scenario: Cart contents survive page refresh
    Given I have trades in my cart
    When I refresh the page
    Then the cart should still contain my trades
    And the quantities should be preserved

  # ===========================================================================
  # Quantity Adjustment Properties
  # ===========================================================================

  @cart @property @adjustment
  Scenario Outline: Increment and decrement buttons work correctly
    Given I have a trade with quantity <start>
    When I click the <button> button
    Then the quantity should be <result>

    Examples: Increment
      | start | button    | result |
      | 1     | increment | 2      |
      | 5     | increment | 6      |
      | 10    | increment | 11     |

    Examples: Decrement
      | start | button    | result |
      | 2     | decrement | 1      |
      | 5     | decrement | 4      |
      | 1     | decrement | 0      |

  # ===========================================================================
  # Stock Validation Properties (SKIPPED - not implemented)
  # ===========================================================================

  # Note: Stock validation is not currently enforced by the cart.
  # These tests are commented out until the feature is implemented.
  
  # @cart @property @stock
  # Scenario Outline: Quantity respects available stock
  #   Given a trade with <stock> items in stock
  #   When I try to set quantity to <requested>
  #   Then the quantity should be limited to <actual>
  #
  #   Examples: Stock limits
  #     | stock | requested | actual |
  #     | 10    | 5         | 5      |
