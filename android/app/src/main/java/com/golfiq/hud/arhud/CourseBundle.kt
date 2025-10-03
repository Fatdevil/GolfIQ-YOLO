package com.golfiq.hud.arhud

import android.location.Location
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

data class CourseCoordinate(
    val latitude: Double,
    val longitude: Double,
) {
    fun toLocation(): Location {
        return Location("course").apply {
            latitude = this@CourseCoordinate.latitude
            longitude = this@CourseCoordinate.longitude
        }
    }
}

data class CourseBundle(
    val id: String,
    val name: String,
    val pin: CourseCoordinate,
    val greenFront: CourseCoordinate,
    val greenCenter: CourseCoordinate,
    val greenBack: CourseCoordinate,
) {
    fun distancesFrom(location: Location): GreenDistances {
        return GreenDistances(
            front = location.distanceTo(greenFront.toLocation()),
            center = location.distanceTo(greenCenter.toLocation()),
            back = location.distanceTo(greenBack.toLocation()),
        )
    }
}

data class GreenDistances(
    val front: Float,
    val center: Float,
    val back: Float,
) {
    fun formattedYards(): Triple<String, String, String> {
        fun yards(meters: Float): String {
            val yards = meters * 1.09361f
            return String.format("%.0f yd", yards)
        }
        return Triple(yards(front), yards(center), yards(back))
    }
}

class CourseBundleRepository(
    private val baseUrl: URL,
) {
    class NetworkException(message: String, cause: Throwable? = null) : Exception(message, cause)

    fun fetch(courseId: String): CourseBundle {
        val courseUrl = baseUrl.resolve("course/$courseId")
        val connection = (courseUrl.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 5000
            readTimeout = 5000
        }

        try {
            val responseCode = connection.responseCode
            if (responseCode !in 200..299) {
                throw NetworkException("Unexpected response: $responseCode")
            }

            val body = connection.inputStream.use { stream ->
                BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
                    reader.readText()
                }
            }

            return parseBundle(JSONObject(body))
        } catch (t: Throwable) {
            throw NetworkException("Failed to load course bundle", t)
        } finally {
            connection.disconnect()
        }
    }

    private fun parseBundle(json: JSONObject): CourseBundle {
        fun JSONObject.coordinateFor(key: String): CourseCoordinate {
            val obj = getJSONObject(key)
            return CourseCoordinate(
                latitude = obj.getDouble("latitude"),
                longitude = obj.getDouble("longitude"),
            )
        }

        return CourseBundle(
            id = json.optString("id", ""),
            name = json.optString("name", ""),
            pin = json.coordinateFor("pin"),
            greenFront = json.coordinateFor("greenFront"),
            greenCenter = json.coordinateFor("greenCenter"),
            greenBack = json.coordinateFor("greenBack"),
        )
    }
}

private fun URL.resolve(path: String): URL {
    return if (toString().endsWith("/")) {
        URL(toString() + path)
    } else {
        URL("$this/$path")
    }
}
