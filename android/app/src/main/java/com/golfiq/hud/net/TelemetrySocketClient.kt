package com.golfiq.hud.net

interface TelemetrySocketClient {
    fun connect()
    fun disconnect()
    fun onMessage(json: String)
}
