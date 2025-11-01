package com.golfiq.wear.model

data class HolePoint(val lat: Double, val lon: Double)

data class HoleBoundingBox(
  val minLat: Double,
  val minLon: Double,
  val maxLat: Double,
  val maxLon: Double,
)

typealias HolePolygon = List<HolePoint>

data class HoleModel(
  val id: String,
  val bbox: HoleBoundingBox,
  val fairways: List<HolePolygon>,
  val greens: List<HolePolygon>,
  val bunkers: List<HolePolygon>,
  val pin: HolePoint?,
)

data class HoleUiState(
  val hole: HoleModel? = null,
  val player: HolePoint? = null,
  val target: HolePoint? = null,
  val tournamentSafe: Boolean = true,
)
