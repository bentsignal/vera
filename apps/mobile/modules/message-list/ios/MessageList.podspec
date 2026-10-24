Pod::Spec.new do |s|
  s.name           = 'MessageList'
  s.version        = '1.0.0'
  s.summary        = 'The native message list (UICollectionView).'
  s.author         = 'Vera'
  s.homepage       = 'https://vera.chat'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  # expo-image bundles SDWebImage already; the list shares its caches.
  s.dependency 'SDWebImage'

  # Tests/ runs on its own (Tests/run.sh), not in the app.
  s.source_files = '*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    # Optimized even in dev clients, so scrolling there is what ships.
    'SWIFT_OPTIMIZATION_LEVEL' => '-O',
  }
end
