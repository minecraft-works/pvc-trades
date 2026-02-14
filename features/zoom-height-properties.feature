@zoom @property
Feature: Zoom Height Properties
  Property-based tests for linear zoom interpolation based on player Y height
  
  Verifies that:
  - Zoom is clamped at ground level (Y ≤ 63) and max altitude (Y ≥ 300)
  - Zoom interpolates linearly between Y=63 (zoom 2) and Y=300 (zoom -3)
  - Zoom is monotonically decreasing with height

  Background:
    Given the navigation test app is configured

  # ===========================================================================
  # Clamped Values (below and above range)
  # ===========================================================================

  @zoom @property @clamped
  Scenario Outline: Zoom clamped at boundary heights
    Given the player height is <y>
    When I calculate the zoom level for that height
    Then the zoom level should be approximately <expected_zoom>

    Examples: Below ground (Y ≤ 63) → Zoom 2
      | y   | expected_zoom |
      | -64 | 2             |
      | 0   | 2             |
      | 63  | 2             |

    Examples: Above max height (Y ≥ 300) → Zoom -3
      | y   | expected_zoom |
      | 300 | -3            |
      | 320 | -3            |
      | 500 | -3            |

  # ===========================================================================
  # Linear Interpolation Samples
  # ===========================================================================

  @zoom @property @interpolation
  Scenario Outline: Zoom interpolates linearly between ground and max height
    Given the player height is <y>
    When I calculate the zoom level for that height
    Then the zoom level should be approximately <expected_zoom>

    Examples: Sample heights across the range
      | y     | expected_zoom |
      | 63    | 2             |
      | 110.4 | 1             |
      | 157.8 | 0             |
      | 205.2 | -1            |
      | 252.6 | -2            |
      | 300   | -3            |

  # ===========================================================================
  # Monotonicity
  # ===========================================================================

  @zoom @property @monotonic
  Scenario: Zoom decreases monotonically with increasing height
    Given these player heights: 0, 63, 80, 100, 130, 181, 250, 300, 400
    When I calculate the zoom levels for all heights
    Then each zoom level should be less than or equal to the previous

  # ===========================================================================
  # Zoom Level Stability
  # ===========================================================================

  @zoom @property @stability
  Scenario: Zoom level changes smoothly at boundaries
    Given the player is bobbing between height 62 and 64
    When the player crosses the 63 block boundary multiple times
    Then the zoom level should not rapidly change
    And there should be at most 4 zoom changes
