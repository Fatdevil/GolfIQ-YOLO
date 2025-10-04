package com.golfiq.hud.arhud

import android.content.Context
import java.io.File
import java.util.concurrent.TimeUnit

class RemoteBundleCache(context: Context, private val courseId: String) {

    data class Metadata(
        val etag: String?,
        val fetchedAtMs: Long,
        val ttlSeconds: Long?,
    )

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("arhud_bundle_cache", Context.MODE_PRIVATE)
    private val dataDirectory: File = File(appContext.filesDir, "arhud_bundles").apply {
        if (!exists()) {
            mkdirs()
        }
    }
    private val dataFile: File = File(dataDirectory, "$courseId.json")

    fun readData(): String? {
        return runCatching { if (dataFile.exists()) dataFile.readText() else null }.getOrNull()
    }

    fun writeData(data: String) {
        runCatching { dataFile.writeText(data) }
    }

    fun readMetadata(): Metadata? {
        val fetchedAt = prefs.getLong(key("fetched_at"), -1L)
        if (fetchedAt <= 0L) return null
        val ttl = prefs.getLong(key("ttl"), Long.MIN_VALUE)
        val ttlSeconds = if (ttl == Long.MIN_VALUE) null else ttl
        val etag = prefs.getString(key("etag"), null)
        return Metadata(etag = etag, fetchedAtMs = fetchedAt, ttlSeconds = ttlSeconds)
    }

    fun writeMetadata(etag: String?, ttlSeconds: Long?, nowMs: Long = System.currentTimeMillis()) {
        prefs.edit()
            .putLong(key("fetched_at"), nowMs)
            .apply {
                if (etag != null) {
                    putString(key("etag"), etag)
                } else {
                    remove(key("etag"))
                }
                if (ttlSeconds != null) {
                    putLong(key("ttl"), ttlSeconds)
                } else {
                    remove(key("ttl"))
                }
            }
            .apply()
    }

    fun ageDays(nowMs: Long = System.currentTimeMillis()): Int {
        val metadata = readMetadata() ?: return 0
        val diff = nowMs - metadata.fetchedAtMs
        if (diff <= 0) return 0
        return (diff / TimeUnit.DAYS.toMillis(1)).toInt()
    }

    private fun key(suffix: String): String = "${courseId}_$suffix"
}
