Feature: Admin shops
  As a player
  I want to see what the server itself sells, apart from player shops
  So that I can compare a player's price with the always-available admin price, or leave the admin shops out

  @shops @admin-shops
  Scenario: Picking the admin shops shows only them, with unlimited stock
    Given the app is loaded with player and admin shops
    When I pick "Admin shops" in the Buying menu
    Then the shop filter should show "Admin shops"
    And 3 trades should be displayed
    And every trade should show unlimited stock
    And the address should contain "owner=Server+Admins"

  @shops @admin-shops
  Scenario: The admin shops filter comes back from the address
    Given the app is opened at "?owner=Server+Admins" with player and admin shops
    Then the shop filter should show "Admin shops"
    And 3 trades should be displayed
    When I remove the shop filter
    Then 5 trades should be displayed
    And the address should not contain "owner="

  @shops @admin-shops
  Scenario: Hiding the admin shops leaves only player shops
    Given the app is loaded with player and admin shops
    When I turn on the "Hide admin shops" filter in the Buying menu
    Then 2 trades should be displayed
    And the address should contain "filters=noadmin"
    When I remove the "No admin shops" pill
    Then 5 trades should be displayed

  @shops @admin-shops
  Scenario: Showing and hiding the admin shops replace each other
    Given the app is opened at "?owner=Server+Admins" with player and admin shops
    When I turn on the "Hide admin shops" filter in the Buying menu
    Then the shop filter should be hidden
    And 2 trades should be displayed
    When I pick "Admin shops" in the Buying menu
    Then the shop filter should show "Admin shops"
    And 3 trades should be displayed
    And the address should not contain "noadmin"

  @shops @admin-shops
  Scenario: Without admin shops in the data, the menu doesn't offer them
    Given the app is loaded with mock shop data
    Then the Buying menu should not offer "Admin shops"
    And the Buying menu should not offer "Hide admin shops"
