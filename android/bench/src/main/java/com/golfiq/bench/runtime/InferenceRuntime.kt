package com.golfiq.bench.runtime

import com.golfiq.bench.runtime.model.InferenceFrame
import com.golfiq.bench.runtime.model.InferenceResult
import java.io.Closeable

interface InferenceRuntime : Closeable {
    val kind: RuntimeKind
    val modelAssetParam: String?
    val modelAssetBin: String?
    val modelAssetData: String

    fun prepare()
    fun run(frame: InferenceFrame): InferenceResult
}
