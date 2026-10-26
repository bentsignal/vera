#import "ComposerMountBridge.h"
#import <React/RCTMountingTransactionObserving.h>
#import <React/RCTComponent.h>
#import <objc/runtime.h>

static void VeraComposerDidMount(id view, SEL selector,
                                const facebook::react::MountingTransaction &transaction,
                                const facebook::react::SurfaceTelemetry &telemetry) {
  NSCAssert([NSThread isMainThread], @"Composer mounts must finish on main");
  if ([view respondsToSelector:@selector(composerSurfaceDidMount:transaction:)]) {
    [(id<VeraComposerMountObserver>)view composerSurfaceDidMount:transaction.getSurfaceId()
                                                  transaction:transaction.getNumber()];
  }
}

BOOL VeraPrepareComposerMountClass(Class viewClass) {
  // Fabric caches this selector on the Expo adapter, whose +new returns
  // the real Swift view. Prepare both classes before factory registration.
  SEL selector = @selector(mountingTransactionDidMount:withSurfaceTelemetry:);
  Method existing = class_getInstanceMethod(viewClass, selector);
  if (existing) {
    return method_getImplementation(existing) == (IMP)VeraComposerDidMount;
  }
  struct objc_method_description method = protocol_getMethodDescription(
      @protocol(RCTMountingTransactionObserving), selector, NO, YES);
  if (!method.types) { return NO; }
  class_addProtocol(viewClass, @protocol(RCTMountingTransactionObserving));
  return class_addMethod(viewClass, selector, (IMP)VeraComposerDidMount, method.types);
}

NSInteger VeraComposerSurfaceForView(UIView *view) {
  // Same root lookup as RCTMountingManager, scoped to an attached hierarchy.
  if (!view.window) { return -1; }
  do {
    if (RCTIsReactRootView(@(view.tag))) { return view.tag; }
    view = view.superview;
  } while (view);
  return -1;
}
