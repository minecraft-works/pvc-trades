Feature: Map Dialog Close Behavior
  As a user viewing a shop map
  I want the dialog to close only when I click outside
  So that I don't accidentally close it while interacting with the map

  Background:
    Given the app is loaded with mock shop data

  @shop-map @dialog @click
  Scenario: Clicking on the map does not close dialog
    When I click on the distance cell of an overworld shop
    And I click on the map area
    Then the map dialog should remain open

  @shop-map @dialog @click
  Scenario: Clicking outside the map closes dialog
    When I click on the distance cell of an overworld shop
    And I click outside the map dialog
    Then the map dialog should be closed

  @shop-map @dialog @drag
  Scenario: Dragging from map to outside does not close dialog
    When I click on the distance cell of an overworld shop
    And I mousedown on the map area
    And I drag to outside the dialog
    And I release the mouse outside the dialog
    Then the map dialog should remain open
