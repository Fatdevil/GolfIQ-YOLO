package com.golfiq.hud.model

data class CachedHole(
    val holeId: String,
    val pinLat: Double,
    val pinLon: Double,
    val layups: List<LayupTarget>,
    val lastSyncedAt: String,
    val caddieRecommendation: Map<String, Any>?
)

data class LayupTarget(
    val id: String,
    val name: String,
    val distanceMeters: Double,
    val hazardDistanceMeters: Double?
)