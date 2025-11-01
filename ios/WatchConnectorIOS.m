#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WatchConnectorIOS, NSObject)
RCT_EXTERN_METHOD(isCapable:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(sendHUDB64:(NSString *)base64 resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
