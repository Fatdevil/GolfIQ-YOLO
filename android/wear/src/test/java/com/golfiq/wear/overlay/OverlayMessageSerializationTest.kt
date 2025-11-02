package com.golfiq.wear.overlay

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OverlayMessageSerializationTest {
    @Test
    fun decodeSnapshot() {
        val json = """
            {
              "v": 1,
              "size": { "w": 320, "h": 320 },
              "ring": [[0.1, 0.2], [0.4, 0.2], [0.3, 0.6]],
              "corridor": [[0.05, 0.1], [0.9, 0.15], [0.9, 0.35], [0.05, 0.4]],
              "labelsAllowed": true,
              "meta": { "club": "7i", "p50_m": 145.0 }
            }
        """.trimIndent()

        val snapshot = OverlaySnapshotV1DTO.fromJsonString(json)
        assertThat(snapshot).isNotNull()
        snapshot!!
        assertThat(snapshot.version).isEqualTo(1)
        assertThat(snapshot.size.w).isWithin(1e-6f).of(320f)
        assertThat(snapshot.ring.size).isAtLeast(3)
        assertThat(snapshot.corridor.size).isAtLeast(3)
        assertThat(snapshot.labelsAllowed).isTrue()
        assertThat(snapshot.meta?.p50_m).isWithin(1e-3f).of(145f)
    }

    @Test
    fun gracefullyHandlesInvalidJson() {
        val invalid = "{" // malformed
        val snapshot = OverlaySnapshotV1DTO.fromJsonString(invalid)
        assertThat(snapshot).isNull()
    }

}
