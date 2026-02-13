@zoom @property
Feature: Zoom Height Properties
  Property-based tests for zoom level height thresholds
  
  Verifies that:
  - Correct zoom levels are selected based on player Y height
  - Threshold boundaries behave correctly
  - Zoom works identically in overworld and nether

  Background:
    Given the navigation test app is configured

  # ===========================================================================
  # Zoom Level Height Thresholds
  # ===========================================================================
  # Thresholds: Y ≤ 80, ≤ 120, ≤ 160, ≤ 200, ≤ 256, > 256

  @zoom @property @thresholds
  Scenario Outline: Correct zoom level for height ranges
    Given the player height is <y>
    When I calculate the zoom level for that height
    Then the zoom level should be <expected_zoom>

    Examples: Ground level (Y ≤ 80) → Zoom 2
      | y   | expected_zoom |
      | -64 | 2             |
      | 0   | 2             |
      | 64  | 2             |
      | 80  | 2             |

    Examples: Rooftops (Y 81-120) → Zoom 1
      | y   | expected_zoom |
      | 81  | 1             |
      | 100 | 1             |
      | 120 | 1             |

    Examples: Medium altitude (Y 121-160) → Zoom 0
      | y   | expected_zoom |
      | 121 | 0             |
      | 140 | 0             |
      | 160 | 0             |

    Examples: High altitude (Y 161-200) → Zoom -1
      | y   | expected_zoom |
      | 161 | -1            |
      | 180 | -1            |
      | 200 | -1            |

    Examples: Very high (Y 201-256) → Zoom -2
      | y   | expected_zoom |
      | 201 | -2            |
      | 230 | -2            |
      | 256 | -2            |

    Examples: Extreme height (Y > 256) → Zoom -3
      | y   | expected_zoom |
      | 257 | -3            |
      | 300 | -3            |
      | 320 | -3            |
      | 500 | -3            |

  # ===========================================================================
  # Boundary Value Tests (Exact Thresholds)
  # ===========================================================================

  @zoom @property @boundaries
  Scenario Outline: Zoom level at exact threshold boundaries
    Given the player height is <y>
    When I calculate the zoom level
    Then the zoom level should be <expected_zoom>

    Examples: Exact boundaries
      | y   | expected_zoom |
      | 79  | 2             |
      | 80  | 2             |
      | 81  | 1             |
      | 119 | 1             |
      | 120 | 1             |
      | 121 | 0             |
      | 159 | 0             |
      | 160 | 0             |
      | 161 | -1            |
      | 199 | -1            |
      | 200 | -1            |
      | 201 | -2            |
      | 255 | -2            |
      | 256 | -2            |
      | 257 | -3            |

  # ===========================================================================
  # Zoom Level Stability
  # ===========================================================================

  @zoom @property @stability
  Scenario: Zoom level doesn't oscillate at boundaries
    Given the player is bobbing between height 79 and 81
    When the player crosses the 80 block boundary multiple times
    Then the zoom level should not rapidly change
    And there should be at most 4 zoom changes
