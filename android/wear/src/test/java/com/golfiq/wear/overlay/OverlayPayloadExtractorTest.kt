package com.golfiq.wear.overlay

import com.google.android.gms.wearable.DataMap
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertNull
import kotlin.text.Charsets

class OverlayPayloadExtractorTest {

    @Test
    fun extractsByteArrayPayload() {
        val expected = """{"v":1,"ring":[[0.1,0.1],[0.2,0.2]]}""".toByteArray(Charsets.UTF_8)
        val dataMap = DataMap().apply {
            putByteArray("payload", expected)
        }

        val result = extractOverlayPayload(dataMap)

        assertContentEquals(expected, result)
    }

    @Test
    fun fallsBackToStringPayload() {
        val json = """{"v":1,"labelsAllowed":false}"""
        val dataMap = DataMap().apply {
            putString("payload", json)
        }

        val result = extractOverlayPayload(dataMap)

        assertContentEquals(json.toByteArray(Charsets.UTF_8), result)
    }

    @Test
    fun returnsNullWhenPayloadMissing() {
        val dataMap = DataMap()

        val result = extractOverlayPayload(dataMap)

        assertNull(result)
    }
}
