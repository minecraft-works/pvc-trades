Feature: Admin shops
  As a player
  I want to see what the server itself sells, apart from player shops
  So that I can compare a player's price with the always-available admin price

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
  Scenario: The admin shops count follows the search
    Given the app is loaded with player and admin shops
    Then the "Admin shops" row in the Buying menu should read "3 shops · 3 trades"
    When I pick "Food" in the Buying menu
    Then the "Admin shops" row in the Buying menu should read "1 shop · 1 trade"

  @shops @admin-shops
  Scenario: Without admin shops in the data, the menu doesn't offer them
    Given the app is loaded with mock shop data
    Then the Buying menu should not offer "Admin shops"
