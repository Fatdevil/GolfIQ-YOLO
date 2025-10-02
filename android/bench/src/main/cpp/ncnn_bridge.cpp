#include <jni.h>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>
#include <android/log.h>
#include <vector>
#include <string>
#include <memory>

namespace {
struct NcnnHandle {
    std::string param_asset;
    std::string bin_asset;
    bool use_vulkan;
};

constexpr const char* kTag = "BenchNcnn";

void logd(const char* msg) { __android_log_write(ANDROID_LOG_DEBUG, kTag, msg); }

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_golfiq_bench_runtime_ncnn_NativeNcnn_nativeInit(
    JNIEnv* env,
    jclass,
    jobject asset_manager,
    jstring param_asset,
    jstring bin_asset,
    jboolean use_vulkan) {
  (void)asset_manager;
  const char* param_chars = param_asset ? env->GetStringUTFChars(param_asset, nullptr) : nullptr;
  const char* bin_chars = bin_asset ? env->GetStringUTFChars(bin_asset, nullptr) : nullptr;
  auto handle = std::make_unique<NcnnHandle>();
  handle->param_asset = param_chars ? param_chars : "";
  handle->bin_asset = bin_chars ? bin_chars : "";
  handle->use_vulkan = use_vulkan;
  if (param_asset) env->ReleaseStringUTFChars(param_asset, param_chars);
  if (bin_asset) env->ReleaseStringUTFChars(bin_asset, bin_chars);
  logd("Initialized NCNN handle (stub)");
  return reinterpret_cast<jlong>(handle.release());
}

extern "C" JNIEXPORT void JNICALL
Java_com_golfiq_bench_runtime_ncnn_NativeNcnn_nativeRelease(
    JNIEnv*, jclass, jlong handle_ptr) {
  auto* handle = reinterpret_cast<NcnnHandle*>(handle_ptr);
  if (handle) {
    delete handle;
    logd("Released NCNN handle (stub)");
  }
}

extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_golfiq_bench_runtime_ncnn_NativeNcnn_nativeRun(
    JNIEnv* env,
    jclass,
    jlong handle_ptr,
    jfloatArray input,
    jint width,
    jint height) {
  (void)handle_ptr;
  (void)input;
  (void)width;
  (void)height;
  // Stubbed inference: return an empty detection set.
  jfloatArray result = env->NewFloatArray(0);
  return result;
}
