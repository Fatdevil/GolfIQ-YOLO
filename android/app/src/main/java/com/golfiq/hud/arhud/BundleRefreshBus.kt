package com.golfiq.hud.arhud

import java.util.concurrent.CopyOnWriteArrayList

object BundleRefreshBus {
    private val listeners = CopyOnWriteArrayList<() -> Unit>()

    fun register(listener: () -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }

    fun requestRefresh() {
        listeners.forEach { it.invoke() }
    }
}
